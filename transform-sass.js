const path = require('path');
const thermatic = require('sass-thematic');
const sass = require('node-sass');

let baseDescribes = [];
let stack = [];
let assertContentCount = -1;
const contentBlocks = [];

function outputDescribe(describeStatment) {
	describe(describeStatment.name, () => {
		describeStatment.describes.forEach(subDescribe => {
			outputDescribe(subDescribe)
		});

		describeStatment.its.forEach(itStatement => {
			it(itStatement.name, () => {
				itStatement.asserts.forEach(assert => assert(itStatement));

				if (itStatement.contentAssert >= 0) {
					const block = contentBlocks[itStatement.contentAssert];
					expect(block.output).toEqual(block.expect);
				}
			});
		});
	});
}

// This is a gross function and should really be refactored
function readUntil(lines, str, startIndex, concatOutput = false) {
	let output = '';
	let i = startIndex;
	while (lines[i] !== str && i < lines.length) {
		if (concatOutput) {
			output += lines[i];
		}
		i++;
	}

	if (i === lines.length) {
		throw new Error(`Could not find a line matching: ${str}`);
	}

	if (concatOutput) {
		return {
			index: i,
			text: output
		}
	}

	return i;
}

function assertContent(result) {
	const lines = result.split('\n');
	let blockIndex = 0;
	let index = 0;

	while (blockIndex <= assertContentCount && index < lines.length) {
		index = readUntil(lines, `\/*${blockIndex}-start*\/`, index);

		index = readUntil(lines, '\/*output-start*\/', index + 1);
		const outputBlock = readUntil(lines, '\/*output-end*\/', index + 1, true);

		index = readUntil(lines, '\/*expect-start*\/', outputBlock.index + 1);

		const expectBlock = readUntil(lines, '\/*expect-end*\/', index + 1, true);

		index = readUntil(lines, `\/*${blockIndex}-end*\/`, expectBlock.index + 1);

		const output = outputBlock.text.slice(8, outputBlock.text.length - 1);
		const expect = expectBlock.text.slice(8, expectBlock.text.length - 1);
		contentBlocks.push({
			expect,
			output
		});
		blockIndex += 1;
	}

	if (blockIndex !== assertContentCount + 1) {
		throw new Error('Could not find the required blocks in the CSS output for content assertions');
	}
}

const functions = {
	'__describePush($name)': function ($name) {
		const describeName = $name.getValue(0);

		if (stack.length === 0) {
			const newDescribe = {its: [], describes: [], name: describeName};
			baseDescribes.push(newDescribe);
			stack.push(newDescribe);
		} else {
			const newDescribe = {its: [], describes: [], name: describeName};
			const head = stack[stack.length - 1];

			if (!head.describes) {
				throw new Error(`Can not put a describe inside of an it statement. Offending describe: "${$name.getValue(0)}"`);
			}

			head.describes.push(newDescribe);
			stack.push(newDescribe);
		}

		return sass.types.String('push_describe_' + describeName);
	},
	'__describePop($name)': ($name) => {
		const describe = stack.pop();

		if (stack.length !== 0) {
			// We only want to generate call out to jest once we're finished with a base describe
			return sass.types.String('pop_describe_' + $name.getValue(0));
		}

		outputDescribe(describe);

		return sass.types.String('pop_describe_' + $name.getValue(0));
	},

	'__itPush($name)': ($name) => {
		const describe = stack[stack.length - 1];

		if (!describe || !describe.its) {
			throw new Error(`it statements must be within a describe block. Offending it: "${$name.getValue(0)}"`);
		}

		describe.its.push({
			asserts: [],
			errors: [],
			name: $name.getValue(0)
		});

		stack.push(describe.its[describe.its.length - 1]);

		return sass.types.String('push_it_' + $name.getValue(0));
	},
	'__itPop($name)': ($name) => {
		stack.pop();
		return sass.types.String('pop_it_' + $name.getValue(0));
	},

	'__assertTrue($areEqual, $value, $expected)': function ($areEqual, $value, $expected) {
		const it = stack[stack.length - 1];

		if (!it.asserts) {
			throw new Error('Can not assert outside of an "it" statement')
		}

		it.asserts.push((context) => {
			expect($areEqual.getValue()).toEqual(true);
		});

		return sass.types.String('assert_true');
	},
	'__stub-error($message)': function ($message) {
		const it = stack[stack.length - 1];

		// TODO: See if there's a more sensible way of capturing errors for a test run, perhaps within the base describe
		if (!it.errors) {
			throw new Error('Can not stub errors outside of an "it" statement. Ensure any code calling @error is within an "it" statement')
		}

		it.errors.push($message.getValue(0));

		return sass.types.String('stub-error');
	},
	'__assertErrorRaised($message)': function ($message) {
		const it = stack[stack.length - 1];

		if (!it.asserts) {
			throw new Error('Can not assert outside of an it statement')
		}

		it.asserts.push((itContext) => {
			expect(itContext.errors.length).toBeGreaterThanOrEqual(1);
			expect(itContext.errors).toContain($message.getValue(0));
		});

		return sass.types.String('assert_error_raised');
	},
	'__assertContentPush()': function () {
		const it = stack[stack.length - 1];

		if (!it.asserts) {
			throw new Error('Can not assert outside of an it statement')
		}

		assertContentCount += 1;
		it.contentAssert = assertContentCount;

		return sass.types.String(assertContentCount.toString());
	}
};

module.exports = {
	run: function (source, testDirectory, cwd) {
		try {
			const result = sass.renderSync({
				data: source,
				functions,
				includePaths: [
					testDirectory,
					cwd,
					__dirname
				],
				outputStyle: 'expanded',
				sourceMap: true
			});

			if (assertContentCount > -1) {
				assertContent(result.css.toString());
			}
		} catch (e) {
			// Todo: Work out how to translate the line/col in here to a useful error message
			const newError = {
				...e,
				message: e.formatted
			};

			throw newError;
		}
	},
	process: function (source, fullFilename, config, options) {
		const filepath = path.dirname(fullFilename);

		const ast = thermatic.parseASTSync({
			cwd: config.cwd,
			data: source,
			includePaths: [
				filepath,
				__dirname
			]
		});

		ast.traverseByType('atkeyword', (node, index, parent) => {
			const child = node.get(0);
			if (child.type === 'ident' && child.content === 'error') {
				const errorMessage = parent.get(2).content;
				const stubbedVersion = thermatic.parseASTSync({
					data: `@return __stub-error(${errorMessage})`
				});

				for (let i = parent.content.length - 1; i >= 0; i--) {
					parent.remove(i);
				}

				const atrules = stubbedVersion.get(0);
				for (let i = 0; i < atrules.content.length; i++) {
					parent.insert(i, atrules.content[i]);
				}
			}
		});

		// Thermatic produces a full AST with no dependencies by inlining all scripts.434
		// So when we parse it we need no includes
		const transformedCss = ast.toString();

		if (process.env.LOCAL_DEBUG_SASS_JEST === 'true') {
			return `
				const run = require('${__dirname}/transform-sass').run;
				
				run(\`${transformedCss}\`, '${filepath}', '${config.cwd}');
			`;
		}

		return `
			const run = require('sass-jest').run;
			
			run(\`${transformedCss}\`, '${filepath}', '${config.cwd}');
		`;
	}
};
