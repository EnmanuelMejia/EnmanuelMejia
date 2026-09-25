(() => {
  const y = document.getElementById("year");
  if (y) y.textContent = new Date().getFullYear();
  [...document.querySelectorAll('a[href^="#"]')].forEach((link) => {
    link.addEventListener("click", (e) => {
      const id = link.getAttribute("href");
      if (!id || id === "#") return;
      const target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      history.replaceState(null, "", id);
    });
  });
})();