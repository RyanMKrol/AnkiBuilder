// Apple Vision text recognition over page images, one JSON line per image on stdout.
//
// Compiled once by src/remaster/visionOcr.js (never run through `swift <file>`, which recompiles on
// every call and costs about six seconds a page). macOS only; the framework ships with the OS.
//
//   vision-ocr <image> [<image> ...]
//   -> {"file":"<image>","lines":[{"text":"...","x":0.1,"y":0.9,"w":0.3,"h":0.02}, ...]}
//
// Coordinates are Vision's normalized ones: origin at the BOTTOM-left, so a running header near
// the top of the page has a y close to 1.
import AppKit
import Foundation
import Vision

func recognize(_ path: String) -> [String: Any] {
  guard let image = NSImage(contentsOf: URL(fileURLWithPath: path)) else {
    return ["file": path, "error": "could not open image"]
  }
  var rect = CGRect(origin: .zero, size: image.size)
  guard let cg = image.cgImage(forProposedRect: &rect, context: nil, hints: nil) else {
    return ["file": path, "error": "could not decode image"]
  }
  let request = VNRecognizeTextRequest()
  request.recognitionLevel = .accurate
  request.recognitionLanguages = ["ja-JP", "en-US"]
  request.usesLanguageCorrection = true
  do {
    try VNImageRequestHandler(cgImage: cg).perform([request])
  } catch {
    return ["file": path, "error": "\(error)"]
  }
  let lines: [[String: Any]] = (request.results ?? []).compactMap { observation in
    guard let best = observation.topCandidates(1).first else { return nil }
    let box = observation.boundingBox
    return ["text": best.string, "x": box.minX, "y": box.minY, "w": box.width, "h": box.height]
  }
  return ["file": path, "lines": lines]
}

for path in CommandLine.arguments.dropFirst() {
  let result = recognize(path)
  let data = try! JSONSerialization.data(withJSONObject: result, options: [])
  FileHandle.standardOutput.write(data)
  FileHandle.standardOutput.write("\n".data(using: .utf8)!)
}
