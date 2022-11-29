// If absolute URL from the remote server is provided, configure the CORS
// header on that server.
var kDefaultPdf = 'boss_level.pdf';
var kPageOne = 1;

// Loaded via <script> tag, create shortcut to access PDF.js exports.
var pdfjsLib = window['pdfjs-dist/build/pdf'];

// The workerSrc property shall be specified.
pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdf.worker.js';

/**
 *PDF variables
 */ 
var pdfDoc = null,
    pageNum = kPageOne,
    pageRendering = false,
    pageNumPending = null,
    scale = 0.8,
    pdfCanvas = null,
    pdfCtx = null;

/**
 *Camera variables
 */
var video = null,
    videoCanvas = null,
    videoCtx = null;

const leftIrisElements = getUniqueElements(FACEMESH_LEFT_IRIS);
const rightIrisElements = getUniqueElements(FACEMESH_RIGHT_IRIS);

const State = {
  Center: 0,
  Left: 1,
  Right: 2
};

var state = State.Center;

const centerDeg = 45;
const triggerDeg = 3;

function getUniqueElements(facemeshPoints) {
  var points = {}
  for (let i = 0; i < facemeshPoints.length; i++) {
    for (let j = 0; j < facemeshPoints[i].length; j++) {
      points[facemeshPoints[i][j]] = true;
    }
  }
  uniquePoints = [];
  for (var k in points) {
    uniquePoints.push(k);
  }
  return uniquePoints;
}

function getCentroid(points, elements) {
  var centroid = {
    x: 0,
    y: 0,
    z: 0
  };
  for (let i = 0; i < points.length; i++) {
    var e = elements[points[i]];
    centroid.x = centroid.x + e.x;
    centroid.y = centroid.x + e.y;
    centroid.z = centroid.x + e.z;
  }
  centroid.x = centroid.x / points.length
  centroid.y = centroid.y / points.length
  centroid.z = centroid.z / points.length
  return centroid;
}

function initOnLoad() {
    pdfCanvas = document.getElementById('pdf-canvas');
    pdfCtx = pdfCanvas.getContext('2d');
    document.getElementById('prev').addEventListener('click', onPrevPage);
    document.getElementById('next').addEventListener('click', onNextPage);

    const input = document.getElementById('myFile');
    input.addEventListener('change', (e) => {

      var file = input.files[0]; if (!file){ console.log('!file :('); return; }
      var fileReader = new FileReader();
      fileReader.onload = function(e){
        var d = new Uint8Array(e.target.result);
        pdfjsLib.getDocument({data: d}).promise.then(updatePdfDoc);
      }
      fileReader.readAsArrayBuffer(file);
    });

    video = document.getElementsByClassName('video')[0];
    videoCanvas = document.getElementsByClassName('video-canvas')[0];
    videoCtx = videoCanvas.getContext('2d');

    const camera = new Camera(video, {
      onFrame: async () => {
        await faceMesh.send({image: video});
      },
      width: 1280,
      height: 720
    });
    camera.start();
}

window.onload = initOnLoad

/**
 * Get page info from document, resize canvas accordingly, and render page.
 * @param num Page number.
 */
function renderPage(num) {
  pageRendering = true;
  // Using promise to fetch the page
  pdfDoc.getPage(num).then(function(page) {
    var viewport = page.getViewport({scale: scale});
    pdfCanvas.height = viewport.height;
    pdfCanvas.width = viewport.width;

    // Render PDF page into canvas context
    var renderContext = {
      canvasContext: pdfCtx,
      viewport: viewport
    };
    var renderTask = page.render(renderContext);

    // Wait for rendering to finish
    renderTask.promise.then(function() {
      pageRendering = false;
      if (pageNumPending !== null) {
        // New page rendering is pending
        renderPage(pageNumPending);
        pageNumPending = null;
      }
    });
  });

  // Update page counters
  document.getElementById('page_num').textContent = num;
}

/**
 * If another page rendering in progress, waits until the rendering is
 * finised. Otherwise, executes rendering immediately.
 */
function queueRenderPage(num) {
  if (pageRendering) {
    pageNumPending = num;
  } else {
    renderPage(num);
  }
}

/**
 * Displays previous page.
 */
function onPrevPage() {
  if (pageNum <= 1) {
    return;
  }
  pageNum--;
  queueRenderPage(pageNum);
}

/**
 * Displays next page.
 */
function onNextPage() {
  if (pageNum >= pdfDoc.numPages) {
    return;
  }
  pageNum++;
  queueRenderPage(pageNum);
}

/**
 * Asynchronously downloads default PDF.
 */
function updatePdfDoc(newPdfDoc) {
  pdfDoc = newPdfDoc;
  document.getElementById('page_count').textContent = pdfDoc.numPages;

  // Initial/first page rendering
  pageNum = kPageOne;
  renderPage(pageNum);
}


pdfjsLib.getDocument(kDefaultPdf).promise.then(updatePdfDoc);

function onResults(results) {
  videoCtx.save();
  videoCtx.clearRect(0, 0, videoCanvas.width, videoCanvas.height);
/*
  videoCtx.drawImage(
      results.image, 0, 0, videoCanvas.width, videoCanvas.height);
*/
  if (results.multiFaceLandmarks) {
    for (const landmarks of results.multiFaceLandmarks) {
      drawConnectors(videoCtx, landmarks, FACEMESH_RIGHT_EYE, {color: '#FF3030'});
      drawConnectors(videoCtx, landmarks, FACEMESH_RIGHT_IRIS, {color: '#FF3030'});
      drawConnectors(videoCtx, landmarks, FACEMESH_LEFT_EYE, {color: '#30FF30'});
      drawConnectors(videoCtx, landmarks, FACEMESH_LEFT_IRIS, {color: '#30FF30'});
      var leftCentroid = getCentroid(leftIrisElements, landmarks);
      var rightCentroid = getCentroid(rightIrisElements, landmarks);
      var ang = Math.atan((rightCentroid.y - leftCentroid.y) / (rightCentroid.x - leftCentroid.x)) * 180 / Math.PI;
      var diff = ang - centerDeg;
      if (diff > triggerDeg) {
        if (state != State.Left) {
          state = State.Left;
          onPrevPage();
        }
      } else if (diff < -triggerDeg) {
        if (state != State.Right) {
          state = State.Right;
          onNextPage();         
        }
      } else {
         state = State.Center;
      }
    }
  } else {
    videoCtx.drawImage(
      results.image, 0, 0, videoCanvas.width, videoCanvas.height);
  }
  videoCtx.restore();
}

const faceMesh = new FaceMesh({locateFile: (file) => {
  return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
}});

faceMesh.setOptions({
  maxNumFaces: 1,
  refineLandmarks: true,
  minDetectionConfidence: 0.5,
  minTrackingConfidence: 0.5
});

faceMesh.onResults(onResults);
