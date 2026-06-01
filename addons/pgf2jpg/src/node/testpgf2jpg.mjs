

import pgf2jpg from './pgf2jpg.mjs';
import fs from 'fs';


try {
	var pgfdata = fs.readFileSync('../../tests/thumbnail.pgf');
} catch (e) {
	console.error("file not found");
}

console.log (pgfdata.length);

var jpgdata = pgf2jpg.pgf2jpg(pgfdata);
console.log (jpgdata.length);

fs.writeFile('../../tests/thumbnail.jpg', jpgdata.data, (err) => {
	if (err) {
		console.log(err);
	}
});				
