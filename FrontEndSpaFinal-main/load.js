window.addEventListener("load", () => {
    const loader = document.querySelector(".loader");
    if (!loader) return;

    // hide the loader, then remove it after the transition finishes
    loader.classList.add("loader-hidden");

    loader.addEventListener("transitionend", () => {
        // remove the actual element node
        if (loader.parentNode) {
            loader.parentNode.removeChild(loader);
        }
    });
});