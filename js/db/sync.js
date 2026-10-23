/** Default adapter: does nothing. Present so the UI and data layer can be written against the interface today. */
export const NoSync = { name: 'Local only', isConfigured: () => false, push: async () => ({ accepted: [], conflicts: [] }), pull: async () => [] };
