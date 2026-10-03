
export async function extractText(
    file: File,
    ): Promise<string> {
        const extension =
            file.name.split(".").pop()?.toLowerCase();
    
        if (extension === "txt") {
            return await file.text();
        }

        return `[Uploaded file: ${file.name}]`;
    }
    ``