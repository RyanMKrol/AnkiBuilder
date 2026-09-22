// Renders a PDF's pages to JPEG, one file per page, and reports what the file itself carries.
//
// Compiled once by src/remaster/pdfPages.js, the same way vision-ocr.swift is. macOS only; PDFKit
// ships with the OS.
//
//   pdf-render <file.pdf> <outDir> <scale>
//   -> {"pages":393,"written":["page-001.jpg", …],"textLayerChars":0,"title":"…"}
//
// `textLayerChars` is how much selectable text the PDF holds: a scan has none, an export from a
// layout program has plenty. It decides nothing here; the eligibility check reports it, because a
// PDF with a real text layer may deserve a different treatment than one that is pictures of paper.
import AppKit
import Foundation
import PDFKit

let args = CommandLine.arguments
guard args.count >= 3 else {
  FileHandle.standardError.write("usage: pdf-render <file.pdf> <outDir> [scale]\n".data(using: .utf8)!)
  exit(2)
}
let url = URL(fileURLWithPath: args[1])
let outDir = URL(fileURLWithPath: args[2], isDirectory: true)
// 2.0 puts a US Letter page at about 1224x1584, close to the page images a Calibre reflow produces
// and comfortably legible for both the OCR and the vision pass.
let scale = args.count > 3 ? (Double(args[3]) ?? 2.0) : 2.0

guard let document = PDFDocument(url: url) else {
  FileHandle.standardError.write("could not open \(url.path)\n".data(using: .utf8)!)
  exit(1)
}

try? FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)

var written: [String] = []
var textChars = 0
for index in 0..<document.pageCount {
  guard let page = document.page(at: index) else { continue }
  textChars += page.string?.count ?? 0

  let name = String(format: "page-%03d.jpg", index + 1)
  let dest = outDir.appendingPathComponent(name)
  written.append(name)
  // An existing render is reused: the PDF is immutable for a given hash, so the file is correct.
  if FileManager.default.fileExists(atPath: dest.path) { continue }

  let bounds = page.bounds(for: .mediaBox)
  let size = NSSize(width: bounds.width * scale, height: bounds.height * scale)
  let image = NSImage(size: size)
  image.lockFocus()
  NSColor.white.setFill()
  NSRect(origin: .zero, size: size).fill()
  if let context = NSGraphicsContext.current?.cgContext {
    context.scaleBy(x: CGFloat(scale), y: CGFloat(scale))
    page.draw(with: .mediaBox, to: context)
  }
  image.unlockFocus()

  guard
    let tiff = image.tiffRepresentation,
    let bitmap = NSBitmapImageRep(data: tiff),
    let jpeg = bitmap.representation(using: .jpeg, properties: [.compressionFactor: 0.85])
  else {
    FileHandle.standardError.write("could not encode page \(index + 1)\n".data(using: .utf8)!)
    exit(1)
  }
  try? jpeg.write(to: dest)
}

let title = document.documentAttributes?[PDFDocumentAttribute.titleAttribute] as? String
let result: [String: Any] = [
  "pages": document.pageCount,
  "written": written,
  "textLayerChars": textChars,
  "title": title ?? "",
]
FileHandle.standardOutput.write(try! JSONSerialization.data(withJSONObject: result, options: []))
FileHandle.standardOutput.write("\n".data(using: .utf8)!)
