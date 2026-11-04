import Chart from 'chart.js/auto';

/**
 * Chart.js draws on a canvas, so it cannot read the CSS theme variables.
 * Axis labels, legends, gridlines and doughnut separators come from these
 * defaults instead of per-chart colours, and every open chart redraws when
 * the theme changes. Imported once by each chart component.
 */

function applyChartTheme() {
  const dark = document.documentElement.dataset.theme === 'dark';
  Chart.defaults.color = dark ? '#a5a1b3' : '#6b6878';
  Chart.defaults.borderColor = dark ? 'rgba(255, 255, 255, 0.07)' : 'rgba(0, 0, 0, 0.05)';
  // Doughnut segments are separated by a ring in the card's colour.
  Chart.defaults.elements.arc.borderColor = dark ? '#1c1a23' : '#ffffff';
}

applyChartTheme();

new MutationObserver(() => {
  applyChartTheme();
  for (const chart of Object.values(Chart.instances)) chart.update();
}).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
