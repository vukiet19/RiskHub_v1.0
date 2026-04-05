const fs = require('fs');
const pdf = require('pdf-parse');

let dataBuffer = fs.readFileSync(process.argv[2]);
let outputFile = process.argv[3];

pdf(dataBuffer).then(function(data) {
    fs.writeFileSync(outputFile, data.text, 'utf-8');
}).catch(function(error){
    console.error(error);
});
