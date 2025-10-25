export const getProjectId = (): string => {
    let projectId: string | undefined;

    
    if (typeof Deno !== 'undefined') {
        projectId = Deno.env.get('REOWN_PROJECT_ID');
    }

    
    if (!projectId && typeof process !== 'undefined') {
        projectId = process.env?.REOWN_PROJECT_ID;
    }

    if (!projectId && typeof Bun !== 'undefined') {
        projectId = Bun.env?.REOWN_PROJECT_ID;
    }

    if (!projectId && typeof globalThis !== 'undefined') {
        projectId = (globalThis as any).REOWN_PROJECT_ID;
    }

    if (!projectId) {
        throw new Error(
            'REOWN_PROJECT_ID is not configured. ' +
            'Please set the REOWN_PROJECT_ID environment variable in your .env file ' +
            'or pass it with --env when running Deno.'
        );
    }

    return projectId;
};