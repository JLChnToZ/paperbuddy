const webpack = require('webpack');
const OptimizeCssAssetsPlugin = require('optimize-css-assets-webpack-plugin');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const TerserWebpackPlugin = require('terser-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

module.exports = {
  entry: './src/index.ts',
  output: {
    filename: 'buddy.js',
    path: __dirname + '/dist',
  },

  // Enable sourcemaps for debugging webpack's output.
  devtool: 'source-map',

  resolve: {
    // Add '.ts' and '.tsx' as resolvable extensions.
    extensions: ['.ts', '.tsx', '.js', '.json', '.css'],
  },

  module: {
    rules: [
      { test: /\.tsx?$/, use: ['awesome-typescript-loader'] },
      { test: /\.css$/, use: [
        MiniCssExtractPlugin.loader,
        // 'style-loader',
        'css-loader',
      ] },
      { test: /\.less$/, use: [
        MiniCssExtractPlugin.loader,
        // 'style-loader',
        'css-loader',
        'less-loader',
      ] },
      { test: /\.(png|jpe?g|gif|woff2?|ttf)$/i, use: ['file-loader'] },
      { enforce: 'pre', test: /\.js$/, loader: 'source-map-loader' },
    ],
  },

  node: {
    fs: 'empty',
  },

  optimization: {
    splitChunks: {
      chunks: 'all',
    },
    minimizer: [
      new TerserWebpackPlugin({
        cache: true,
        parallel: true,
        terserOptions: {
          compress: false,
          ecma: 6,
          mangle: true,
          output: {
            quote_style: 2,
            max_line_len: 1024,
          },
        },
        sourceMap: true,
      }),
      new OptimizeCssAssetsPlugin({
        cssProcessorPluginOptions: {
          preset: 'advanced',
        },
      }),
    ],
  },

  plugins: [
    new CleanWebpackPlugin({
      cleanOnceBeforeBuildPatterns: ['**/*', '!.gitkeep'],
    }),
    new webpack.ProvidePlugin({
      $: 'jquery',
      jQuery: 'jquery'
    }),
    new HtmlWebpackPlugin(),
    new MiniCssExtractPlugin(),
  ],
};