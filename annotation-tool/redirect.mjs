const target = new URL("../", window.location.href);
target.searchParams.set("mode", "annotation");
window.location.replace(target);
