/**
 * WebMCP Type Definitions
 * 
 * TypeScript types for the WebMCP browser API (Chrome 146+).
 * These types describe the navigator.modelContext API used to register
 * structured tools that AI agents can discover and invoke.
 * 
 * @see https://developer.chrome.com/blog/webmcp-epp
 * @dev-only This module is only loaded in development builds.
 */

/** JSON Schema type for tool input definitions */
export interface JSONSchemaProperty {
    type: 'string' | 'number' | 'boolean' | 'object' | 'array';
    description?: string;
    enum?: string[];
    items?: JSONSchemaProperty;
    properties?: Record<string, JSONSchemaProperty>;
    required?: string[];
    default?: unknown;
    oneOf?: Array<{ const: string; title: string }>;
}

export interface JSONSchema {
    type: 'object';
    properties: Record<string, JSONSchemaProperty>;
    required?: string[];
}

/** Content block returned by tool execution */
export interface ToolContent {
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
}

/** Tool execution result */
export interface ToolResult {
    content: ToolContent[];
    isError?: boolean;
}

/** WebMCP tool annotations */
export interface ToolAnnotations {
    /** Hint that this tool only reads data (no side effects) */
    readOnlyHint?: string;
    /** Hint that this tool modifies data */
    destructiveHint?: string;
    /** Hint that this tool is idempotent */
    idempotentHint?: string;
}

/** A WebMCP tool definition */
export interface WebMCPTool {
    /** Unique tool name (snake_case recommended) */
    name: string;
    /** Human-readable description of what the tool does */
    description: string;
    /** JSON Schema defining the tool's input parameters */
    inputSchema: JSONSchema;
    /** Optional annotations about the tool's behavior */
    annotations?: ToolAnnotations;
    /** The function that executes when the tool is invoked */
    execute: (params: Record<string, unknown>) => ToolResult | Promise<ToolResult>;
}

/** The navigator.modelContext API shape */
export interface ModelContextAPI {
    /** Register a single tool without removing others */
    registerTool: (tool: WebMCPTool) => void;
    /** Remove a specific tool by name */
    unregisterTool: (name: string) => void;
    /** Replace all registered tools with a new set */
    provideContext: (ctx: { tools: WebMCPTool[] }) => void;
    /** Remove all registered tools */
    clearContext: () => void;
}

/** Extend the Navigator interface to include modelContext */
declare global {
    interface Navigator {
        modelContext?: ModelContextAPI;
        /** Testing API (Chrome extension uses this) */
        modelContextTesting?: ModelContextAPI;
    }
}

/** Tool category for organizing tools in the registry */
export type ToolCategory =
    | 'auth'
    | 'navigation'
    | 'state'
    | 'teacher'
    | 'student'
    | 'admin'
    | 'test'
    | 'homework'
    | 'session'
    | 'class'
    | 'course'
    | 'material';

/** Tool registration entry with metadata */
export interface ToolRegistration {
    tool: WebMCPTool;
    category: ToolCategory;
    /** Route patterns where this tool should be active (glob-like) */
    activeRoutes?: string[];
    /** User roles that can use this tool */
    allowedRoles?: string[];
}
