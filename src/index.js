const fs = require('fs');
const path = require('path');
const babel = require('@babel/core');

// main function to bundle files in a webpack-way
const build = ({ entryFile, outputFolder }) => {
  // build dependency graph
  const graph = createDependencyGraph(entryFile);
  // console.log('Graph: ', graph);
  // bundle the assets
  const outputFiles = bundle(graph);
  // write to output folder
  for (const outputFile of outputFiles) {
    const outputPath = path.join(outputFolder, outputFile.name);
    fs.writeFileSync(outputPath, outputFile.content, 'utf-8');
  }
};

class Module {
  constructor(filePath) {
    this.filePath = filePath;
    this.content = fs.readFileSync(filePath, 'utf-8');
    this.ast = babel.parseSync(this.content);
    this.dependencies = this.findDependencies();
  }
  findDependencies() {
    return this.ast.program.body
      .filter((node) => node.type === 'ImportDeclaration')
      .map((node) => node.source.value) // get the requested path
      .map((relativePath) => resolveRequest(this.filePath, relativePath)) // resolve the path to get the actual file path
      .map((absolutePath) => createModule(absolutePath)); // create a module for each dependency
  }
  transformModuleInterface() {
    const { types: t } = babel;
    const { filePath } = this;
    const { ast, code } = babel.transformFromAstSync(this.ast, this.content, {
      ast: true,
      plugins: [
        function () {
          return {
            visitor: {
              ImportDeclaration(path) {
                const properties = path.get('specifiers').map((specifier) => {
                  const imported = specifier.isImportDefaultSpecifier()
                    ? t.identifier('default')
                    : specifier.get('imported').node;
                  const local = specifier.get('local').node;

                  return t.objectProperty(imported, local, false, false);
                });
                path.replaceWith(
                  t.variableDeclaration('const', [
                    t.variableDeclarator(
                      t.objectPattern(properties),
                      t.callExpression(t.identifier('require'), [
                        t.stringLiteral(
                          resolveRequest(
                            filePath,
                            path.get('source.value').node
                          )
                        ),
                      ])
                    ),
                  ])
                );
              },
              ExportDefaultDeclaration(path) {
                path.replaceWith(
                  t.expressionStatement(
                    t.assignmentExpression(
                      '=',
                      t.memberExpression(
                        t.identifier('exports'),
                        t.identifier('default'),
                        false
                      ),
                      t.toExpression(path.get('declaration').node)
                    )
                  )
                );
              },
              ExportNamedDeclaration(path) {
                const declarations = [];
                if (path.has('declaration')) {
                  if (path.get('declaration').isFunctionDeclaration()) {
                    declarations.push({
                      name: path.get('declaration.id').node,
                      value: t.toExpression(path.get('declaration').node),
                    });
                  } else {
                    path
                      .get('declaration.declarations')
                      .forEach((declaration) => {
                        declarations.push({
                          name: declaration.get('id').node,
                          value: declaration.get('init').node,
                        });
                      });
                  }
                } else {
                  path.get('specifiers').forEach((specifier) => {
                    declarations.push({
                      name: specifier.get('exported').node,
                      value: specifier.get('local').node,
                    });
                  });
                }
                path.replaceWithMultiple(
                  declarations.map((decl) =>
                    t.expressionStatement(
                      t.assignmentExpression(
                        '=',
                        t.memberExpression(
                          t.identifier('exports'),
                          decl.name,
                          false
                        ),
                        decl.value
                      )
                    )
                  )
                );
              },
            },
          };
        },
      ],
    });
    this.ast = ast;
    this.content = code;
  }
}

// resolve relative path only
const resolveRequest = (requester, requestPath) => {
  return path.join(path.dirname(requester), requestPath);
};

const createDependencyGraph = (entryFile) => {
  const rootModule = createModule(entryFile);
  return rootModule;
};

const createModule = (filePath) => {
  return new Module(filePath);
};

const bundle = (graph) => {
  const modules = collectModules(graph);
  const moduleMap = toModuleMap(modules);
  // console.log('moduleMap: ', moduleMap);
  const moduleCode = addRuntime(moduleMap, modules[0].filePath);
  return [{ name: 'bundle.js', content: moduleCode }];
};

const collectModules = (graph) => {
  const modules = [];
  collect(graph, modules);
  return modules;

  function collect(module, modules) {
    modules.push(module);
    module.dependencies.forEach((dependency) => collect(dependency, modules));
  }
};

const toModuleMap = (modules) => {
  let moduleMap = '';
  moduleMap += '{';

  for (const module of modules) {
    module.transformModuleInterface();
    moduleMap += `"${module.filePath}": function(exports, require) { ${module.content} },`;
  }

  moduleMap += '}';
  return moduleMap;
};

const addRuntime = (moduleMap, entryPoint) => {
  return trim(`
    const modules = ${moduleMap};
    const entry = '${entryPoint}';
    function webpackStart({ modules, entry }) {
      const moduleCache = {};
      const require = moduleName => {
        // if in cache, return the cached version
        if (moduleCache[moduleName]) {
          return moduleCache[moduleName];
        }
        const exports = {};
        // prevent infinite require loops from circular dependencies
        moduleCache[moduleName] = exports;
        // require the module
        modules[moduleName](exports, require);
        return moduleCache[moduleName];
      };
      // start the program
      require(entry);
    }
    webpackStart({ modules, entry });
  `);
};

const trim = (str) => {
  const lines = str.split('\n').filter(Boolean);
  const padLength = lines[0].length - lines[0].trimLeft().length;
  const regex = new RegExp(`^\\s{${padLength}}`);
  return lines.map((line) => line.replace(regex, '')).join('\n');
};

build({
  entryFile: path.join(__dirname, '../input/index.js'),
  outputFolder: path.join(__dirname, '../output'),
});
