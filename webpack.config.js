const HtmlWebpackPlugin = require('html-webpack-plugin');
const path = require('path');  
module.exports = {  
  entry: './src/index.js',  
  devtool: 'inline-source-map',  
  module: {  
    rules: [  
      {
          test: /\.html$/,
          loader: 'html-loader'
      }
    ]  
  },  
  resolve: {  
    extensions: [ '.tsx', '.ts', '.js' ]  
  },  
  output: {  
    filename: 'main.js',  
    path: path.resolve(__dirname, './dist'),
  },
  plugins: [new HtmlWebpackPlugin({
    template: 'index.html'
  })],

};