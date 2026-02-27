/**
 * GDPR Filter (PRD §4.13.7)
 *
 * Filters deleted_users/ data during restore:
 * Entities with status === 'completed' are excluded from restore.
 */

/**
 * Filter out GDPR-completed deleted user entities from restore data.
 *
 * @param deletedUsersData - The deleted_users/ node data from backup
 * @returns filtered data and count of excluded entities
 */
export function filterGdprEntities(
    deletedUsersData: Record<string, unknown>
): { filtered: Record<string, unknown>; excludedCount: number } {
    const filtered: Record<string, unknown> = {};
    let excludedCount = 0;

    for (const [key, value] of Object.entries(deletedUsersData)) {
        const entity = value as Record<string, unknown>;
        if (entity.status === 'completed') {
            excludedCount++;
        } else {
            filtered[key] = value;
        }
    }

    return { filtered, excludedCount };
}
