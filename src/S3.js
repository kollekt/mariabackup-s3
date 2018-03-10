const ProgressBar = require('progress');
const s3 = require('s3');
const s3Client = s3.createClient({
  s3Options: {
    accessKeyId: process.env.S3_KEY,
    secretAccessKey: process.env.S3_SECRET,
    region: process.env.S3_REGION || 'eu-west-1',
  },
});

const Bucket = process.env.S3_BUCKET;

const list = (path) => {
  return new Promise(function (resolve, reject) {
    const params = {
      s3Params: {
        Bucket,
        Prefix: path,
        Delimiter: '/'
      },
      recursive: false
    };
    const objectsStream = s3Client.listObjects(params);
    const objects = [];
    objectsStream.on('data', function (obj) {
      if (obj.CommonPrefixes) {
        obj.CommonPrefixes.forEach(function (value) {
          objects.push(value.Prefix);
        });
      }
    });
    objectsStream.on('error', function (e) {
      reject(e);
    });
    objectsStream.on('end', function (e) {
      resolve(objects);
    });
  });
};

const pullDir = (src, dest) => {
  return new Promise(function (resolve, reject) {
    const params = {
      localDir: dest,
      deleteRemoved: true, // default false, whether to remove s3 objects
      s3Params: {
        Bucket,
        Prefix: src,
      },
    };
    const downloader = s3Client.downloadDir(params);
    console.log();
    var bar = new ProgressBar(`downloading backup ${src} [:bar] :percent :etas`, {
      complete: '=',
      incomplete: ' ',
      width: 20,
      total: 100
    });
    downloader.on('progress', function (data) {
      if (downloader.progressTotal) {
        bar.update(downloader.progressAmount / downloader.progressTotal);
      }
    });
    downloader.on('error', function (err) {
      console.log('\n');
      console.log(err);
      reject(err);
    });
    downloader.on('end', function () {
      resolve();
    });
  });
};

const uploadDir = (src, dest) => {

  return new Promise(function (resolve, reject) {
    const params = {
      localDir: src,
      deleteRemoved: true, // default false, whether to remove s3 objects
      s3Params: {
        Bucket,
        Prefix: dest,
      },
    };

    console.log();
    var bar = new ProgressBar('uploading backup [:bar] :percent :etas', {
      complete: '=',
      incomplete: ' ',
      width: 20,
      total: 100
    });

    const uploader = s3Client.uploadDir(params);
    uploader.on('error', function (err) {
      console.log('\n');
      console.log(err);
      reject(err);
    });
    uploader.on('progress', function () {
      if (uploader.progressTotal) {
        bar.update(uploader.progressAmount / uploader.progressTotal);
      }
    });
    uploader.on('end', function () {
      console.log('upload completed');
      resolve();
    });
  });
};

const removeDirs = (dirs) => {
  const promises = dirs.map(dir =>
    new Promise(function (resolve, reject) {
      const params = {
          Bucket,
          Prefix: dir,
      };
      const client = s3Client.deleteDir(params);
      client.on('error', reject);
      client.on('end', resolve);
    })
  );
  return Promise.all(promises);
};

module.exports = {
  list,
  pullDir,
  uploadDir,
  removeDirs
};
