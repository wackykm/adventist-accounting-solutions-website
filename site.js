/* Hero bar-line chart: hovered bar rises most, neighbors less,
   and the green line tracks the bar tops while they move. */
(function () {
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var chart = document.querySelector('[data-chart]');
  if (!chart) return;
  var wrap = chart.querySelector('.chart-bars');
  var bars = Array.prototype.slice.call(wrap.children);
  var svg = chart.querySelector('.chart-line');
  var line = svg.querySelector('polyline');
  var ns = 'http://www.w3.org/2000/svg';
  var dots = bars.map(function () {
    var c = document.createElementNS(ns, 'circle');
    c.setAttribute('r', 3.5);
    svg.appendChild(c);
    return c;
  });
  var until = 0;
  var hover = -1;

  function draw() {
    var box = chart.getBoundingClientRect();
    var pts = bars.map(function (b, i) {
      var r = b.getBoundingClientRect();
      var x = r.left - box.left + r.width / 2;
      var y = r.top - box.top;
      dots[i].setAttribute('cx', x);
      dots[i].setAttribute('cy', y);
      dots[i].setAttribute('r', i === hover ? 6 : 3.5);
      return x.toFixed(1) + ',' + y.toFixed(1);
    });
    line.setAttribute('points', pts.join(' '));
  }

  function animate(ms) {
    until = Math.max(until, performance.now() + ms);
    (function tick() {
      draw();
      if (performance.now() < until) requestAnimationFrame(tick);
    })();
  }

  function setHover(i) {
    hover = i;
    bars.forEach(function (b, j) {
      var d = i < 0 ? 99 : Math.abs(i - j);
      var s = d === 0 ? 1.16 : d === 1 ? 1.09 : d === 2 ? 1.04 : 1;
      b.style.setProperty('--s', s);
      b.classList.toggle('is-hover', d === 0);
    });
    animate(reduce ? 0 : 650);
  }

  bars.forEach(function (b, i) {
    b.addEventListener('mouseenter', function () { setHover(i); });
  });
  wrap.addEventListener('mouseleave', function () { setHover(-1); });
  window.addEventListener('resize', draw);

  if (reduce) {
    chart.classList.remove('is-loading');
    draw();
  } else {
    bars.forEach(function (b, i) { b.style.transitionDelay = (i * 35) + 'ms'; });
    requestAnimationFrame(function () {
      chart.classList.remove('is-loading');
      animate(1400);
      setTimeout(function () {
        bars.forEach(function (b) { b.style.transitionDelay = ''; });
      }, 1400);
    });
  }
})();
