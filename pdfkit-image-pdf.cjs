// pdfkit-image-pdf.js
// Usage: node pdfkit-image-pdf.js img1.png img2.jpg ...
// Output: output.pdf (Acrobat-compatible)

const PDFDocument = require('pdfkit');
const fs = require('fs');

function addImagePage(doc, imgPath) {
  const img = doc.openImage(imgPath);
  doc.addPage({ size: [img.width, img.height] });
  doc.image(imgPath, 0, 0, { width: img.width, height: img.height });
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: node pdfkit-image-pdf.js img1.png img2.jpg ...');
    process.exit(1);
  }
  const doc = new PDFDocument({ autoFirstPage: false });
  const out = fs.createWriteStream('output.pdf');
  doc.pipe(out);
  for (const imgPath of args) {
    try {
      addImagePage(doc, imgPath);
      console.log(`Added: ${imgPath}`);
    } catch (e) {
      console.error(`Failed to add ${imgPath}:`, e.message);
    }
  }
  doc.end();
  out.on('finish', () => {
    console.log('PDF created: output.pdf');
  });
}

main();
