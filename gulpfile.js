'use strict';

var gulp = require('gulp');
var prettify = require('gulp-jsbeautifier');
var diff = require('gulp-diff');
var webpack = require('webpack-stream');
var named = require('vinyl-named');
var esformatter = require('gulp-esformatter');
var esformatter_origin = require('esformatter');
var through = require('through2');
var electron = require('electron-connect').server.create({
  path: './dist'
});
var packager = require('electron-packager');
const fs = require('fs');

const distPackageAuthor = 'Mattermost, Inc.';

var sources = ['**/*.js', '**/*.json', '**/*.css', '**/*.html', '!**/node_modules/**', '!dist/**', '!release/**', '!**/test_config.json'];

gulp.task('prettify', ['prettify:sources', 'prettify:jsx']);
gulp.task('prettify:verify', ['prettify:sources:verify', 'prettify:jsx:verify']);

var prettify_options = {
  html: {
    indent_size: 2,
    end_with_newline: true
  },
  css: {
    indent_size: 2,
    end_with_newline: true
  },
  js: {
    indent_size: 2,
    brace_style: "end-expand",
    end_with_newline: true
  }
};

gulp.task('prettify:sources', ['sync-meta'], function() {
  return gulp.src(sources)
    .pipe(prettify(prettify_options))
    .pipe(prettify.reporter())
    .pipe(diff())
    .pipe(diff.reporter({
      quiet: true,
      fail: false
    }))
    .pipe(gulp.dest('.'));
});

gulp.task('prettify:sources:verify', function() {
  return gulp.src(sources)
    .pipe(prettify(prettify_options))
    .pipe(prettify.reporter())
    .pipe(diff())
    .pipe(diff.reporter({
      quiet: true,
      fail: true
    }));
});


var esformatter_jsx_options = {
  indent: {
    value: '  '
  },
  plugins: ['esformatter-jsx']
};

gulp.task('prettify:jsx', function() {
  return gulp.src('src/browser/**/*.jsx')
    .pipe(esformatter(esformatter_jsx_options))
    .pipe(gulp.dest('src/browser'));
});

gulp.task('prettify:jsx:verify', function() {
  return gulp.src('src/browser/**/*.jsx')
    .pipe(through.obj(function(file, enc, cb) {
      var result = esformatter_origin.diff.unified(file.contents.toString(), esformatter_origin.rc(file.path, esformatter_jsx_options));
      if (result !== "") {
        console.log('Error: ' + file.path + ' must be formatted');
        process.exit(1);
      }
      cb();
    }));
});


gulp.task('build', ['sync-meta', 'webpack', 'copy'], function(cb) {
  const appPackageJson = require('./src/package.json');
  const distPackageJson = Object.assign({}, appPackageJson, {
    author: {
      name: distPackageAuthor,
      email: 'noreply'
    }
  });
  fs.writeFile('./dist/package.json', JSON.stringify(distPackageJson, null, '  '), cb);
});

gulp.task('webpack', ['webpack:main', 'webpack:browser', 'webpack:webview']);

gulp.task('webpack:browser', function() {
  return gulp.src('src/browser/*.jsx')
    .pipe(named())
    .pipe(webpack({
      module: {
        loaders: [{
          test: /\.json$/,
          loader: 'json'
        }, {
          test: /\.jsx$/,
          loader: 'babel',
          query: {
            presets: ['react']
          }
        }]
      },
      output: {
        filename: '[name].js'
      },
      node: {
        __filename: false,
        __dirname: false
      },
      target: 'electron-renderer'
    }))
    .pipe(gulp.dest('dist/browser/'));
});

gulp.task('webpack:main', function() {
  return gulp.src('src/main.js')
    .pipe(webpack({
      module: {
        loaders: [{
          test: /\.json$/,
          loader: 'json'
        }]
      },
      output: {
        filename: '[name].js'
      },
      node: {
        __filename: false,
        __dirname: false
      },
      target: 'electron-main',
      externals: {
        remote: true // for electron-connect
      }
    }))
    .pipe(gulp.dest('dist/'));
});

gulp.task('webpack:webview', function() {
  return gulp.src('src/browser/webview/mattermost.js')
    .pipe(named())
    .pipe(webpack({
      output: {
        filename: '[name].js'
      },
      target: 'electron'
    }))
    .pipe(gulp.dest('dist/browser/webview'));
});

gulp.task('copy', ['copy:resources', 'copy:html/css', 'copy:modules']);

gulp.task('copy:resources', function() {
  return gulp.src('src/resources/**')
    .pipe(gulp.dest('dist/resources'));
});

gulp.task('copy:html/css', function() {
  return gulp.src(['src/browser/**/*.html', 'src/browser/**/*.css'])
    .pipe(gulp.dest('dist/browser'));
});

gulp.task('copy:modules', function() {
  return gulp.src(['src/node_modules/bootstrap/dist/**'])
    .pipe(gulp.dest('dist/browser/modules/bootstrap'));
});

gulp.task('watch', ['build'], function() {
  var options = ['--livereload'];
  electron.start(options);

  gulp.watch(['src/main.js', 'src/main/**/*.js', 'src/common/**/*.js'], ['webpack:main']);
  gulp.watch(['src/browser/**/*.js', 'src/browser/**/*.jsx'], ['webpack:browser', 'webpack:webview']);
  gulp.watch(['src/browser/**/*.css', 'src/browser/**/*.html', 'src/resources/**/*.png'], ['copy']);

  gulp.watch(['dist/main.js', 'dist/resources/**'], function() {
    electron.restart(options);
  });
  gulp.watch(['dist/browser/*.js'], electron.reload);
});

function makePackage(platform, arch, callback) {
  var packageJson = require('./src/package.json');
  packager({
    dir: './dist',
    platform: platform,
    arch: arch,
    version: require('./package.json').devDependencies['electron-prebuilt'],
    out: './release',
    prune: true,
    overwrite: true,
    "app-version": packageJson.version,
    icon: 'resources/opennms',
    "version-string": {
      CompanyName: distPackageAuthor,
      LegalCopyright: `Copyright (c) 2015 - ${new Date().getFullYear()} ${packageJson.author.name}`,
      FileDescription: packageJson.productName,
      OriginalFilename: packageJson.productName + '.exe',
      ProductVersion: packageJson.version,
      ProductName: packageJson.productName,
      InternalName: packageJson.name
    },
    sign: '3rd Party Mac Developer Application: The OpenNMS Group, Inc. (N7VNY4MNDW)'
  }, function(err, appPath) {
    if (err) {
      callback(err);
    }
    else {
      if (platform === 'linux' || platform === 'all') {
        const dest_32 = 'release/Mattermost-linux-ia32';
        const dest_64 = 'release/Mattermost-linux-x64';
        fs.createReadStream('resources/icon.png').pipe(fs.createWriteStream(`${dest_32}/icon.png`));
        fs.createReadStream('resources/icon.png').pipe(fs.createWriteStream(`${dest_64}/icon.png`));
        fs.createReadStream('resources/linux/create_desktop_file.sh')
          .pipe(fs.createWriteStream(`${dest_32}/create_desktop_file.sh`))
          .on('finish', () => {
            fs.chmodSync(`${dest_32}/create_desktop_file.sh`, '755');
          });
        fs.createReadStream('resources/linux/create_desktop_file.sh')
          .pipe(fs.createWriteStream(`${dest_64}/create_desktop_file.sh`))
          .on('finish', () => {
            fs.chmodSync(`${dest_64}/create_desktop_file.sh`, '755');
          });
        setTimeout(() => {
          callback();
        }, 1000); // should wait all pipes
      }
      else {
        callback();
      }
    }
  });
}

gulp.task('package', ['build'], function(cb) {
  makePackage(process.platform, 'all', cb);
});

gulp.task('package:all', ['build'], function(cb) {
  makePackage('all', 'all', cb);
});

gulp.task('package:windows', ['build'], function(cb) {
  makePackage('win32', 'all', cb);
});

gulp.task('package:osx', ['build'], function(cb) {
  makePackage('darwin', 'all', cb);
});

gulp.task('package:linux', ['build'], function(cb) {
  makePackage('linux', 'all', cb);
});

gulp.task('sync-meta', function() {
  var appPackageJson = require('./src/package.json');
  var packageJson = require('./package.json');
  appPackageJson.name = packageJson.name;
  appPackageJson.productName = packageJson.productName;
  appPackageJson.version = packageJson.version;
  appPackageJson.description = packageJson.description;
  appPackageJson.author = packageJson.author;
  appPackageJson.license = packageJson.license;
  fs.writeFileSync('./src/package.json', JSON.stringify(appPackageJson, null, '  ') + '\n');
});
