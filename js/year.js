/**
 * Keeps footer copyright years current automatically — no more
 * hardcoded "2024" that goes stale every January.
 * Usage: <span class="current-year">2024</span>
 */
document.addEventListener('DOMContentLoaded', () => {
    const year = new Date().getFullYear();
    document.querySelectorAll('.current-year').forEach((el) => {
        el.textContent = year;
    });
});
