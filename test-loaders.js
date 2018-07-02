const path = require('path');
const sass = require('node-sass');

const result = sass.renderSync({
	file: '__tests__/asserts.scss',
	importer: (url, prev) => {
		let file = path.dirname(prev);

		if (!url.endsWith('.scss')) {
			const lastPart = url.split(path.sep).pop();
			file = `_${lastPart}.scss`;
		}

		const fullPath = path.join(path.dirname(prev), file);

		return null;
	},
	includePaths: [
		__dirname
	],
	outputStyle: 'expanded',
	sourceMap: true
});