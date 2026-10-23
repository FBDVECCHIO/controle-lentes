const fs = require('fs');

const html = fs.readFileSync('Index.html', 'utf8');
const lines = html.split('\n');

console.log("Searching for character '{' at column 16 (0-indexed 15) in Index.html...");

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (line.length >= 16) {
    if (line[15] === '{') {
      console.log(`Line ${i + 1}: ${line.trim()}`);
    }
  }
}
