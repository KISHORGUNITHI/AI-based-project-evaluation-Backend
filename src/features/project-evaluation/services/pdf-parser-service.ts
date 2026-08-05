import fs from "fs"

import { PDFParse } from "pdf-parse"

export class PdfParserService {
	async extractText(filePath: string): Promise<string> {
		const dataBuffer = fs.readFileSync(filePath);
		const parser = new PDFParse({ data: dataBuffer });
		const pdfData = await parser.getText();
		return pdfData.text;
	}
}