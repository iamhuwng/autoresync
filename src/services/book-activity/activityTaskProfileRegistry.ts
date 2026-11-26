import manifestJson from './runtime/activityRendererManifest.json';
import type {
  ActivityContextMode,
  ActivityInteractionFamily,
  ActivityPresentationMode,
  ActivityTaskProfileRegistration,
} from '../../types/bookActivity.types';

interface ManifestRegistration {
  readonly profile: {
    readonly taxonomyId: string;
    readonly typeId: string;
    readonly taxonomyVersion: number;
  } | null;
  readonly family: string;
  readonly variant: string;
  readonly presentationMode: ActivityPresentationMode;
}

const buildDefaultTaskProfileRegistry = (
  registrations: readonly ManifestRegistration[],
): readonly ActivityTaskProfileRegistration[] => {
  const grouped = new Map<string, {
    taxonomyId: string;
    typeId: string;
    taxonomyVersion: number;
    families: Set<ActivityInteractionFamily>;
    variants: Set<string>;
    presentationModes: Set<ActivityPresentationMode>;
    contextModes: Set<ActivityContextMode>;
  }>();

  for (const entry of registrations) {
    if (!entry.profile) continue;
    const key = `${entry.profile.taxonomyId}\u0000${entry.profile.typeId}\u0000${entry.profile.taxonomyVersion}`;
    let group = grouped.get(key);
    if (!group) {
      group = {
        taxonomyId: entry.profile.taxonomyId,
        typeId: entry.profile.typeId,
        taxonomyVersion: entry.profile.taxonomyVersion,
        families: new Set(),
        variants: new Set(),
        presentationModes: new Set(),
        contextModes: new Set(),
      };
      grouped.set(key, group);
    }
    group.families.add(entry.family as ActivityInteractionFamily);
    group.variants.add(entry.variant);
    group.presentationModes.add(entry.presentationMode);
    if (entry.presentationMode === 'source-assisted') {
      group.contextModes.add('required');
    } else {
      group.contextModes.add('none');
      group.contextModes.add('optional');
    }
  }

  return Array.from(grouped.values()).map((group) => ({
    taxonomyId: group.taxonomyId,
    typeId: group.typeId,
    taxonomyVersion: group.taxonomyVersion,
    interactionFamilies: Array.from(group.families),
    variants: Array.from(group.variants),
    presentationModes: Array.from(group.presentationModes),
    contextModes: Array.from(group.contextModes),
  }));
};

/**
 * Canonical registered Task Profiles derived directly from the runtime renderer
 * manifest. Safe for both browser UX validation and Cloudflare Worker validation.
 */
export const defaultBookActivityTaskProfileRegistry: readonly ActivityTaskProfileRegistration[] =
  buildDefaultTaskProfileRegistry(manifestJson.registrations as readonly ManifestRegistration[]);
