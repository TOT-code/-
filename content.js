// content.js

let previewContainer = null;
let targetElementForPreview = null;
let currentPreviewImageUrl = null;
let isPluginActive = true; // Plugin is active by default
let notificationTimeout = null;

const ZOOM_FACTOR = 1.5;
const MAX_PREVIEW_WIDTH = window.innerWidth * 0.8;
const MAX_PREVIEW_HEIGHT = window.innerHeight * 0.8;
const MOUSE_OFFSET_X = 15;
const MOUSE_OFFSET_Y = 15;

const HIGH_RES_DATA_ATTRIBUTES = [
  'data-large-src', 'data-original-src', 'data-highres-src',
  'data-full-src', 'data-zoom-src', 'data-src', 'data-original'
];

function showPageNotification(message) {
  let notificationDiv = document.getElementById('hoverzoom-notification');
  if (!notificationDiv) {
    notificationDiv = document.createElement('div');
    notificationDiv.id = 'hoverzoom-notification';
    document.body.appendChild(notificationDiv);
  }
  notificationDiv.textContent = message;
  notificationDiv.style.display = 'block';

  if (notificationTimeout) {
    clearTimeout(notificationTimeout);
  }
  notificationTimeout = setTimeout(() => {
    notificationDiv.style.display = 'none';
  }, 2000); // Notification visible for 2 seconds
}

function togglePluginActiveState(event) {
  // Check for Ctrl + Q
  if (event.ctrlKey && (event.key === 'q' || event.key === 'Q' || event.code === 'KeyQ')) {
    event.preventDefault(); // Prevent default browser action for Ctrl+Q (e.g., quit on some systems)
    isPluginActive = !isPluginActive;
    const status = isPluginActive ? "开启" : "关闭";
    showPageNotification(`图片悬浮放大功能已${status}`);
    console.log(`[HoverZoom] Plugin state toggled by Ctrl+Q. Active: ${isPluginActive}`);
    if (!isPluginActive && previewContainer && previewContainer.style.display === 'block') {
      hideImagePreview(); // Hide preview if plugin is deactivated while a preview is shown
    }
  }
}

// Add listener for keyboard events on the document
document.addEventListener('keydown', togglePluginActiveState, true);


function createPreviewContainer() {
  if (!previewContainer) {
    previewContainer = document.createElement('div');
    previewContainer.classList.add('image-hover-preview-container');
    const imgElement = document.createElement('img');
    previewContainer.appendChild(imgElement);
    document.body.appendChild(previewContainer);
    console.log('[HoverZoom] Preview container created.');
  }
  return previewContainer;
}

function extractUrlFromBackgroundImage(cssBackgroundImage) {
  if (!cssBackgroundImage || cssBackgroundImage === 'none') {
    return null;
  }
  const match = cssBackgroundImage.match(/url\(['"]?(.*?)['"]?\)/i);
  return match && match[1] ? match[1] : null;
}

function getHigherResolutionSrc(imageUrl, baseElement = null) {
  let resolvedUrl = imageUrl;
  if (!resolvedUrl) return null; 

  if (resolvedUrl.includes('sinaimg.cn')) {
    const sinaSizeRegex = /\/(thumb\w*|square|bmiddle|mw\d+|orj\d+)\//i;
    if (sinaSizeRegex.test(resolvedUrl)) {
      const sinaLargeUrl = resolvedUrl.replace(sinaSizeRegex, '/large/');
      if (sinaLargeUrl !== resolvedUrl) {
        console.log('[HoverZoom] Attempting Sina Weibo "large" URL:', sinaLargeUrl);
        resolvedUrl = sinaLargeUrl;
      }
    }
  } else if (resolvedUrl.includes('pbs.twimg.com/media/')) {
    let twitterNewUrl = resolvedUrl.replace(/name=[a-zA-Z0-9_]+/, 'name=orig');
    if (twitterNewUrl === resolvedUrl && !resolvedUrl.includes('name=orig')) {
        const separator = resolvedUrl.includes('?') ? '&' : '?';
        twitterNewUrl = `${resolvedUrl}${separator}name=orig`;
    }
    if (twitterNewUrl !== resolvedUrl) {
        console.log('[HoverZoom] Attempting Twitter original URL:', twitterNewUrl);
        resolvedUrl = twitterNewUrl;
    }
  }

  if (baseElement) {
    for (const attr of HIGH_RES_DATA_ATTRIBUTES) {
      const dataSrc = baseElement.getAttribute(attr);
      if (dataSrc && isValidImageUrl(dataSrc)) {
        console.log(`[HoverZoom] Found high-res URL in ${attr}:`, dataSrc);
        return dataSrc;
      }
    }
    if (baseElement.tagName === 'IMG') {
        const parentLink = baseElement.closest('a');
        if (parentLink && parentLink.href && isValidImageUrl(parentLink.href)) {
            if (parentLink.href.toLowerCase().match(/\.(jpeg|jpg|gif|png|webp|bmp)(\?|$)/i)) {
                console.log('[HoverZoom] Found high-res URL in parent <a> href:', parentLink.href);
                return parentLink.href;
            }
        }
    }
  }
  
  if (resolvedUrl !== imageUrl) return resolvedUrl;

  console.log('[HoverZoom] No higher resolution source found or rules applied, using original src:', imageUrl);
  return imageUrl;
}

function isValidImageUrl(url) {
  if (!url) return false;
  try {
    const parsedUrl = new URL(url, window.location.href);
    return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
  } catch (e) {
    return false;
  }
}

function showImagePreview(event) {
  if (!isPluginActive) return; 

  const target = event.target;
  let potentialSrc = null;
  let baseElementForAttrs = target;

  if (target.tagName === 'IMG') {
    potentialSrc = target.src;
  } else if (target.tagName === 'VIDEO' && target.poster) {
    potentialSrc = target.poster;
  } else {
    const computedStyle = window.getComputedStyle(target);
    potentialSrc = extractUrlFromBackgroundImage(computedStyle.backgroundImage);
    if (!potentialSrc && target.children.length > 0) {
        for(let i=0; i < target.children.length; i++) {
            const childStyle = window.getComputedStyle(target.children[i]);
            potentialSrc = extractUrlFromBackgroundImage(childStyle.backgroundImage);
            if (potentialSrc) {
                baseElementForAttrs = target.children[i];
                break;
            }
        }
    }
  }

  if (!potentialSrc || !isValidImageUrl(potentialSrc)) return;
  
  const rect = target.getBoundingClientRect();
  if (target.closest('.image-hover-preview-container') || rect.width < 30 || rect.height < 30) return;

  console.log('[HoverZoom] Mouse over eligible element:', target, 'Potential src:', potentialSrc);
  targetElementForPreview = target;
  currentPreviewImageUrl = potentialSrc;

  const imageUrlToLoad = getHigherResolutionSrc(currentPreviewImageUrl, baseElementForAttrs);
  if (!imageUrlToLoad) { 
    console.warn('[HoverZoom] No valid image URL to load after attempting to get high-res.');
    return;
  }

  const container = createPreviewContainer();
  const previewImg = container.querySelector('img');
  
  previewImg.dataset.originalThumbSrc = currentPreviewImageUrl;

  previewImg.onload = () => {
    console.log('[HoverZoom] Preview image loaded successfully:', previewImg.src);
    let previewWidth = previewImg.naturalWidth * ZOOM_FACTOR;
    let previewHeight = previewImg.naturalHeight * ZOOM_FACTOR;
    const aspectRatio = previewImg.naturalWidth / previewImg.naturalHeight;

    if (previewWidth > MAX_PREVIEW_WIDTH) {
      previewWidth = MAX_PREVIEW_WIDTH;
      previewHeight = previewWidth / aspectRatio;
    }
    if (previewHeight > MAX_PREVIEW_HEIGHT) {
      previewHeight = MAX_PREVIEW_HEIGHT;
      previewWidth = previewHeight * aspectRatio;
    }
    if (previewWidth > MAX_PREVIEW_WIDTH) {
        previewWidth = MAX_PREVIEW_WIDTH;
        previewHeight = previewWidth / aspectRatio;
    }
    
    container.style.width = `${previewWidth}px`;
    container.style.height = `${previewHeight}px`;
    previewImg.style.width = '100%';
    previewImg.style.height = '100%';

    positionPreviewContainer(event);
    container.style.display = 'block';
    console.log('[HoverZoom] Preview shown for:', previewImg.src, `Size: ${previewWidth}x${previewHeight}`);
  };

  previewImg.onerror = () => {
    console.warn('[HoverZoom] Failed to load image:', previewImg.src);
    const fallbackSrc = previewImg.dataset.originalThumbSrc;
    if (previewImg.src !== fallbackSrc && fallbackSrc && isValidImageUrl(fallbackSrc)) {
        console.log('[HoverZoom] Falling back to original found src:', fallbackSrc);
        previewImg.src = fallbackSrc;
    } else {
        console.error('[HoverZoom] Fallback also failed or was invalid. Hiding preview.');
        hideImagePreview();
    }
  };

  previewImg.src = imageUrlToLoad;
  
  const initialWidth = (target.tagName === 'IMG' ? target.naturalWidth : rect.width) || 200;
  const initialHeight = (target.tagName === 'IMG' ? target.naturalHeight : rect.height) || 150;

  container.style.width = `${Math.min(initialWidth * ZOOM_FACTOR, MAX_PREVIEW_WIDTH)}px`;
  container.style.height = `${Math.min(initialHeight * ZOOM_FACTOR, MAX_PREVIEW_HEIGHT)}px`;
  positionPreviewContainer(event);
}

function hideImagePreview() {
  if (targetElementForPreview) {
    console.log('[HoverZoom] Preview hidden for element:', targetElementForPreview);
  }
  if (previewContainer) {
    previewContainer.style.display = 'none';
    const imgElement = previewContainer.querySelector('img');
    if (imgElement) {
        imgElement.src = '';
        imgElement.onload = null;
        imgElement.onerror = null;
    }
  }
  targetElementForPreview = null;
  currentPreviewImageUrl = null;
}

function positionPreviewContainer(event) {
  if (!previewContainer || previewContainer.style.display === 'none') return;

  let x = event.clientX + MOUSE_OFFSET_X;
  let y = event.clientY + MOUSE_OFFSET_Y;
  const containerWidth = previewContainer.offsetWidth;
  const containerHeight = previewContainer.offsetHeight;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  if (x + containerWidth > viewportWidth) x = event.clientX - containerWidth - MOUSE_OFFSET_X;
  if (y + containerHeight > viewportHeight) y = event.clientY - containerHeight - MOUSE_OFFSET_Y;
  if (x < 0) x = MOUSE_OFFSET_X;
  if (y < 0) y = MOUSE_OFFSET_Y;

  previewContainer.style.left = `${x}px`;
  previewContainer.style.top = `${y}px`;
}

document.addEventListener('mouseover', showImagePreview, true);

document.addEventListener('mouseout', (event) => {
  if (targetElementForPreview && event.target === targetElementForPreview && 
      (!previewContainer || !previewContainer.contains(event.relatedTarget))) {
     hideImagePreview();
  } else if (targetElementForPreview && previewContainer && 
             previewContainer.contains(event.target) && !previewContainer.contains(event.relatedTarget)) {
     hideImagePreview();
  }
}, true);

document.addEventListener('mousemove', (event) => {
  if (!isPluginActive) return; 
  if (targetElementForPreview && previewContainer && previewContainer.style.display === 'block') {
    if (!previewContainer.contains(event.target)) {
        positionPreviewContainer(event);
    }
  }
}, true);

const observer = new MutationObserver(mutations => {
  // Observer logic
});
observer.observe(document.body, { childList: true, subtree: true });

console.log('[HoverZoom] Content script with Ctrl+Q toggle, notifications, and improved image source detection loaded.');
