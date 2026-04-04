import CopyWebpackPlugin from 'copy-webpack-plugin';
import webpack from 'webpack';

const config = {
  mode: 'production',
  entry: './revolver.ts',
  target: 'node',
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        exclude: [/node_modules/, /\.d\.ts$/],
        use: {
          loader: 'ts-loader',
          options: {
            configFile: 'tsconfig.build.json',
          },
        },
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },
  output: {
    filename: 'revolver.js',
    library: {
      type: 'commonjs2',
    },
    // path: path.resolve(__dirname, 'dist'),
  },
  plugins: [
    new CopyWebpackPlugin({
      patterns: [
        { from: 'LICENSE', to: 'revolver.js.LICENSE.txt' },
      ],
    }),
    new webpack.optimize.LimitChunkCountPlugin({
      maxChunks: 1,
    }),
  ],
};

export default config;