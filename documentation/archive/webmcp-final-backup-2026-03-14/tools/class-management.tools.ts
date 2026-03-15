/**
 * WebMCP Tools — Class Management
 *
 * Dev-only tools for teacher class-detail workflows.
 */

import type { ToolRegistration } from '../types';

function getClassIdFromPath(): string | null {
  const match = window.location.pathname.match(/^\/teacher\/classes\/([^/]+)/);
  return match?.[1] || null;
}

export const classManagementTools: ToolRegistration[] = [
  {
    category: 'class',
    activeRoutes: ['/teacher/classes/:classId'],
    allowedRoles: ['teacher', 'super_admin'],
    tool: {
      name: 'get_class_student_roster',
      description: 'Get the currently visible student roster from the class detail student list table.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
      annotations: { readOnlyHint: 'true' },
      execute: async () => {
        try {
          const rows = Array.from(document.querySelectorAll('table tbody tr'));
          const students = rows.map((row) => {
            const cells = row.querySelectorAll('td');
            return {
              name: cells[0]?.textContent?.trim() || '',
              status: cells[1]?.textContent?.trim() || '',
              joinedDate: cells[2]?.textContent?.trim() || '',
              lastActive: cells[3]?.textContent?.trim() || '',
            };
          });

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({ total: students.length, students }),
            }],
          };
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
        }
      },
    },
  },
  {
    category: 'class',
    activeRoutes: ['/teacher/classes/:classId'],
    allowedRoles: ['teacher', 'super_admin'],
    tool: {
      name: 'remove_class_student',
      description: 'Remove a student from the current class by studentId.',
      inputSchema: {
        type: 'object',
        properties: {
          studentId: {
            type: 'string',
            description: 'Student ID to remove from class.',
          },
          classId: {
            type: 'string',
            description: 'Optional class ID override. If omitted, uses current URL class ID.',
          },
        },
        required: ['studentId'],
      },
      annotations: { destructiveHint: 'true' },
      execute: async ({ studentId, classId }) => {
        try {
          if (typeof studentId !== 'string' || !studentId.trim()) {
            return {
              content: [{ type: 'text', text: 'studentId is required.' }],
              isError: true,
            };
          }

          const resolvedClassId =
            typeof classId === 'string' && classId.trim()
              ? classId.trim()
              : getClassIdFromPath();

          if (!resolvedClassId) {
            return {
              content: [{ type: 'text', text: 'Could not resolve classId from current route.' }],
              isError: true,
            };
          }

          const { removeStudentFromClass } = await import('../../services/classManager');
          const result = await removeStudentFromClass(resolvedClassId, studentId.trim());

          if (!result.success) {
            return {
              content: [{ type: 'text', text: result.error || 'Failed to remove student.' }],
              isError: true,
            };
          }

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({ success: true, classId: resolvedClassId, studentId: studentId.trim() }),
            }],
          };
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
        }
      },
    },
  },
];
