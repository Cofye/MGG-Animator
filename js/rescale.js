function scaleSite() {
  const baseWidth = 1920;
  const baseHeight = 1080;
  const container = document.getElementById("scale-container");
  const containerLayer = document.getElementById("scale-container-layer");
  if (!container) return;
  const windowWidth = window.innerWidth;
  const windowHeight = window.innerHeight;
  const scale = Math.min(windowWidth / baseWidth, windowHeight / baseHeight);
  currentScale = scale;
  container.style.transform = `scale(${scale})`;
  container.style.transformOrigin = "top left";
  containerLayer.style.transform = `scale(${scale})`;
  containerLayer.style.transformOrigin = "top left";
  const scaledWidth = baseWidth * scale;
  const scaledHeight = baseHeight * scale;
  const offsetX = (windowWidth - scaledWidth) / 2;
  const offsetY = (windowHeight - scaledHeight) / 2;
  container.style.position = "absolute";
  container.style.left = `${offsetX}px`;
  container.style.top = `${offsetY}px`;
  containerLayer.style.position = "absolute";
  containerLayer.style.left = `${offsetX}px`;
  containerLayer.style.top = `${offsetY}px`;
  document.body.style.overflow = "hidden";
  document.body.style.margin = "0";
  document.documentElement.style.overflow = "hidden";
}

function scaleCover() {
  const baseWidth = 1920;
  const baseHeight = 1080;
  const container = document.getElementById("cover-container");
  if (!container) return;
  const windowWidth = window.innerWidth;
  const windowHeight = window.innerHeight;
  const scale = Math.max(windowWidth / baseWidth, windowHeight / baseHeight);
  container.style.transform = `scale(${scale})`;
  container.style.transformOrigin = "top left";
  const scaledWidth = baseWidth * scale;
  const scaledHeight = baseHeight * scale;
  const offsetX = (windowWidth - scaledWidth) / 2;
  const offsetY = (windowHeight - scaledHeight) / 2;
  container.style.position = "absolute";
  container.style.left = `${offsetX}px`;
  container.style.top = `${offsetY}px`;
  container.style.width = `${baseWidth}px`;
  container.style.height = `${baseHeight}px`;
  document.body.style.overflow = "hidden";
  document.body.style.margin = "0";
  document.documentElement.style.overflow = "hidden";
}

window.addEventListener("load", () => {
  scaleSite();
  scaleCover();
});

window.addEventListener("resize", () => {
  scaleSite();
  scaleCover();
});

