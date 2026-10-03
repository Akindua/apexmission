import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
 
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

export async function extractText(
    file: File,
): Promise<string> {
    const extension =
    file.name.split(".").pop()?.toLowerCase();

    if (extension === "txt") {
        return await file.text();
    }

    if (extension === "pdf") {
        const buffer = await file.arrayBuffer();

        const pdf = await pdfjsLib.getDocument({
            data: buffer,
        }).promise;

        const pages: string[] = [];

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);

            const content = await page.getTextContent();

            const text = content.items
            .map((item: any) => item.str)
            .join(" ");
             
            pages.push(text);
        }

        return pages.join("\n\n");
    }

    return `[Uploaded file: ${file.name}]`;
}