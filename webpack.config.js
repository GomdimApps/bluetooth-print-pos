const path = require('path')

const tsRule = { test: /\.ts$/, use: 'ts-loader', exclude: /node_modules/ }
const pointOfSaleExternals = [/^@point-of-sale\//]

function umdConfig(argv) {
  return {
    name: 'umd',
    entry: path.resolve(__dirname, 'index.ts'),
    target: 'web',
    mode: argv.mode === 'production' ? 'production' : 'development',
    output: {
      path: path.resolve(__dirname, 'build'),
      filename: 'printer-wrapper.js',
      library: { name: 'PrinterWrapper', type: 'umd', export: 'default' },
      globalObject: 'this',
    },
    resolve: {
      extensions: ['.ts', '.js'],
      conditionNames: ['import', 'browser', 'require', 'default'],
    },
    module: { rules: [tsRule] },
  }
}

function esmConfig(argv) {
  return {
    name: 'esm',
    entry: path.resolve(__dirname, 'index.ts'),
    target: 'web',
    mode: argv.mode === 'production' ? 'production' : 'development',
    experiments: { outputModule: true },
    externals: pointOfSaleExternals,
    externalsType: 'module',
    output: {
      path: path.resolve(__dirname, 'build'),
      filename: 'printer-wrapper.esm.js',
      library: { type: 'module' },
      module: true,
    },
    resolve: { extensions: ['.ts', '.js'] },
    module: { rules: [tsRule] },
  }
}

module.exports = (env, argv) => [umdConfig(argv), esmConfig(argv)]
