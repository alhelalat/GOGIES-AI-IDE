/**
 * Manages persistent UI state using localStorage.
 */

export const expandedFolders = {
    _getKey: function() {
        // Make the key specific to the current workspace to avoid state collision
        const workspaceName = localStorage.getItem('current_workspace_name') || 'default';
        // Sanitize the name for use as a key
        const sanitizedName = workspaceName.replace(/[^a-zA-Z0-9_-]/g, '_');
        return `ide-expanded-folders-${sanitizedName}`;
    },
    _get: function() {
        try {
            const stored = localStorage.getItem(this._getKey());
            return stored ? new Set(JSON.parse(stored)) : new Set();
        } catch (e) {
            console.error("Could not read expanded folders from localStorage", e);
            return new Set();
        }
    },
    _set: function(pathsSet) {
        try {
            localStorage.setItem(this._getKey(), JSON.stringify(Array.from(pathsSet)));
        } catch (e) {
            console.error("Could not save expanded folders to localStorage", e);
        }
    },
    add: function(path) {
        const paths = this._get();
        paths.add(path);
        this._set(paths);
    },
    remove: function(path) {
        const paths = this._get();
        paths.delete(path);
        this._set(paths);
    },
    has: function(path) {
        return this._get().has(path);
    }
};