import { TestData, ContextResource } from '../../../services/testStorage';

/**
 * Maps legacy test data (passages, audioSections, questionImages) to Unified Resources.
 * This ensures the Editor can work with a single list of "Context" items.
 */
export const adaptTestToResources = (test: TestData): ContextResource[] => {
    const resources: ContextResource[] = [];

    // DEBUG: Log what we receive
    console.log('📋 [adaptTestToResources] Called with test:', {
        id: test.id,
        skill: test.skill,
        hasPassages: test.passages?.length || 0,
        hasAudioSections: test.audioSections?.length || 0,
        hasQuestionImages: test.questionImages?.length || 0,
        questionImagesData: test.questionImages,
    });

    // 1. Map Text Passages
    if (test.passages && test.passages.length > 0) {
        test.passages.forEach((passage) => {
            resources.push({
                id: passage.id,
                type: 'text',
                title: passage.title || `Passage`,
                content: passage.content,
                wordCount: passage.wordCount,
                questionStart: passage.questionStart,
                questionEnd: passage.questionEnd,
            });
        });
    }

    // 2. Map Audio Sections (without images - images will be separate resources)
    if (test.audioSections && test.audioSections.length > 0) {
        test.audioSections.forEach((section) => {
            resources.push({
                id: `audio-${section.number}`, // Generate a stable ID based on section number
                type: 'audio',
                title: section.name || `Audio Section ${section.number}`,
                audioUrl: section.audioUrl,
                questionStart: section.startQuestion,
                questionEnd: section.endQuestion,
                duration: section.duration,
            });
        });
    }

    // 3. Map Question Images as individual Image Resources (one per image for per-image question ranges)
    if (test.questionImages && test.questionImages.length > 0) {
        test.questionImages.forEach((img, index) => {
            // Find the corresponding audio section to get fallback question range
            const audioSection = test.audioSections?.find(s => s.number === img.sectionNumber);

            // Use per-image question range if available, otherwise fall back to section range
            const questionStart = img.questionRange?.start || audioSection?.startQuestion || 1;
            const questionEnd = img.questionRange?.end || audioSection?.endQuestion || test.questions?.length || 0;

            resources.push({
                id: `image-${img.sectionNumber}-${index}`,
                type: 'image',
                title: `Section ${img.sectionNumber} Image ${index + 1}`,
                images: [img.imageUrl], // Single image per resource
                questionStart,
                questionEnd,
            });
        });
    }

    // DEBUG: Log created resources
    console.log('📋 [adaptTestToResources] Created resources:', resources.map(r => ({
        id: r.id,
        type: r.type,
        title: r.title,
        imageCount: r.images?.length || 0
    })));

    return resources;
};

/**
 * Updates a list of questions to include `resourceId` links based on legacy fields.
 * This is a run-once migration when loading the test into the editor.
 */
export const linkQuestionsToResources = (questions: TestData['questions'], resources: ContextResource[]): TestData['questions'] => {
    return questions.map(q => {
        // If already linked, skip
        if (q.resourceId) return q;

        // Try to link by Passage ID (Reading)
        if (q.passageId) {
            const matchingResource = resources.find(r => r.id === q.passageId && r.type === 'text');
            if (matchingResource) {
                return { ...q, resourceId: matchingResource.id };
            }
        }

        // Try to link by Section Number (Listening)
        if (q.sectionNumber !== undefined) {
            const matchingResource = resources.find(r => r.id === `audio-${q.sectionNumber}` && r.type === 'audio');
            if (matchingResource) {
                return { ...q, resourceId: matchingResource.id };
            }
        }

        return q;
    });
};

/**
 * converts Unified Resources back to legacy TestData format for saving.
 * This ensures backward compatibility with the existing database schema.
 */
export const adaptResourcesToTest = (resources: ContextResource[]): Partial<TestData> => {
    const updates: Partial<TestData> = {};

    // 1. Convert 'text' resources to passages
    const textResources = resources.filter(r => r.type === 'text');
    if (textResources.length > 0) {
        updates.passages = textResources.map(r => ({
            id: r.id,
            title: r.title,
            content: r.content || '',
            type: 'text',
            wordCount: r.wordCount || 0,
            questionStart: r.questionStart || 0,
            questionEnd: r.questionEnd || 0,
            createdAt: Date.now(), // We might lose original creation time if not careful, but for editing this is acceptable or we could store it in metadata
        }));
    } else {
        updates.passages = [];
    }

    // 2. Convert 'audio' resources to audioSections
    const audioResources = resources.filter(r => r.type === 'audio');
    if (audioResources.length > 0) {
        updates.audioSections = audioResources.map((r, index) => {
            // extract section number from ID if possible, else index + 1
            const id = r.id || '';
            const match = id.match(/^audio-(\d+)$/);
            const number = match && match[1] ? parseInt(match[1]) : index + 1;

            return {
                number,
                name: r.title,
                audioUrl: r.audioUrl || '',
                startQuestion: r.questionStart || 0,
                endQuestion: r.questionEnd || 0,
                duration: r.duration || 0,
            };
        });
    } else {
        updates.audioSections = [];
    }

    // 3. Convert 'image' resources to questionImages
    // Each image resource now represents a single image with its own question range
    const imageResources = resources.filter(r => r.type === 'image');
    let allImages: NonNullable<TestData['questionImages']> = [];

    imageResources.forEach((r) => {
        if (r.images && r.images.length > 0) {
            const id = r.id || '';
            // Extract section number from image resource ID
            // New format: "image-{sectionNumber}-{index}" e.g., "image-1-0"
            // Legacy format: "image-section-{sectionNumber}" e.g., "image-section-1"
            let sectionNumber = 1;

            const newFormatMatch = id.match(/^image-(\d+)-\d+$/);
            const legacyFormatMatch = id.match(/^image-section-(\d+)$/);

            if (newFormatMatch && newFormatMatch[1]) {
                sectionNumber = parseInt(newFormatMatch[1]);
            } else if (legacyFormatMatch && legacyFormatMatch[1]) {
                sectionNumber = parseInt(legacyFormatMatch[1]);
            }

            // Each image resource should have only one image now, but handle arrays for backward compat
            r.images.forEach(imgUrl => {
                allImages.push({
                    sectionNumber,
                    imageUrl: imgUrl,
                    // Always preserve the question range from the resource
                    questionRange: (r.questionStart !== undefined && r.questionEnd !== undefined)
                        ? { start: r.questionStart, end: r.questionEnd }
                        : undefined,
                });
            });
        }
    });

    updates.questionImages = allImages.length > 0 ? allImages : [];

    return updates;
};
