# sass-jest

`sass-jest` is a Sass preproccessor for Jest that lets you test projects with Sass. The API used matches the excellent [sass-true](https://github.com/oddbird/true) library.

# Install

To use this in your project, run:
```sh
npm install --save-dev sass-jest
```

If you don't already have jest installed,
```sh
npm install --save-dev jest sass-jest
```

Modify your project's `package.json` so that the test and jest section looks something like:
```json
{
    "scripts": {
        "test": "jest"
    },
    "jest": {
        "moduleFileExtensions": [
            "js",
            "scss"
        ],
        "transform": {
            "^.+\\.scss$": "sass-jest"
        },
        "testRegex": "__tests__/.*\\.(js|scss)$"
    }
}
```

Import the mixins to your test file, like any other Sass file:
```scss
@import "sass-jest";
```

# Usage

sass-jest follows Jest's structure for writing tests by using `describe/it`.
```scss
@include describe('Zip [function]') {
    @include it('Zips multiple lists into a single multi-dimensional list') {
    
        // Assert the expected results
        @include assert-equal(
            zip(a b c, 1 2 3),
            (a 1, b 2, c 3)
        );
        
        @include assert-true(true);
        @include assert-false(false);
    }
}
```
 
### Asserting an @error was raised
 
Using `@error` will cause the Sass compiler to bail out with the given message, to get around this `sass-jest` converts all `@error` calls to a return statement and handles catching the error message for you.
```scss
@function throws-error() {
    @error "Thrown error"
}

@include describe ('Error') {
    @include it ('Captures the error and asserts its value') {
        // Make sure you call the code that will throw the error within the "it" mixin
        $dummy: throws-error();
        @include assert-error-raised ("Thrown error");
    }
}
``` 
_Note: As `@error` is converted to a return, functions that call functions that raise errors will have different behavior._
 
### Test CSS output from mixins
 
One can use the `assert` mixin to compare the compiled CSS that your code produces.
```scss
@include it('compares two blocks of css') {
    @include assert {
        @include output {
          @include font-size('large');
        }
        
        @include expect {
            font-size: 2rem;
            line-height: 3rem;
        }
    }
 }
```
 
## Test Environment
 
If you do not have any tests that require `jsdom` then you can set Jest's test environment to `node` instead as this will reduce the startup time for your tests to run.
```json
{
    "jest": {
      "testEnvironment": "node"
    }
}
```
 
## Todo

1. Add switch to turn of `@error` converting
2. Provide better error messages when a test fails
3. Support source maps to show where in the sass file an error was raised
4. Parse output blocks into an AST and strip whitespace/comments for less fragile comparisons 