(() => {
  const y = document.getElementById("year");
  if (y) y.textContent = new Date().getFullYear();
  // Native fragment navigation preserves focus, URL history, and the Back button.
  // Smooth scrolling and reduced motion are handled in the stylesheet.
})();
