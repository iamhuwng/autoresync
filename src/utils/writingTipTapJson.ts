export interface TipTapJsonDocument {
    type: 'doc';
    content: TipTapParagraphNode[];
}

interface TipTapParagraphNode {
    type: 'paragraph';
    content: TipTapTextNode[];
}

interface TipTapTextNode {
    type: 'text';
    text: string;
}

export function convertTextToTipTapJson(text: string): TipTapJsonDocument {
    return {
        type: 'doc',
        content: text.split('\n').map((line) => ({
            type: 'paragraph',
            content: line.length > 0
                ? [{ type: 'text', text: line }]
                : [],
        })),
    };
}
