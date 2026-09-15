(function () {
  "use strict";

  // Rezept-Basiswerte aus "A Better 1 Cup V60 Technique" (15 g : 250 g, 1:16,7)
  var BASE_COFFEE = 15;
  var BASE_WATER = 250;
  var RATIO = BASE_WATER / BASE_COFFEE; // 16,7

  // Gießdauer je Guss bei Basismenge (Sekunden), in der im Rezept angegebenen Reihenfolge:
  // Bloom, auf 40 %, auf 60 %, auf 80 %, auf 100 %
  var BASE_POUR_SECONDS = [10, 15, 10, 10, 10];
  var STAGE_FRACTIONS = [0.2, 0.4, 0.6, 0.8, 1.0];

  // Wartezeiten aus dem Rezept, bleiben unabhängig von der Menge konstant
  var SWIRL_AFTER_BLOOM = 5;
  var BLOOM_REST = 30;
  var POUR_PAUSE = 10;
  var FINAL_SWIRL = 5;
  var DRAWDOWN_TAIL_BASE = 55; // Sekunden von letztem Schwenken bis "Drawdown durch" bei 250 g

  var waterInput = document.getElementById("input-water");
  var groundsInput = document.getElementById("input-grounds");
  var waterSlider = document.getElementById("slider-water");
  var groundsSlider = document.getElementById("slider-grounds");
  var resultEl = document.getElementById("calc-result");
  var ablaufBody = document.getElementById("ablauf-body");

  // Vorwärmen: Verlust beim Durchspülen, bevor das Wasser unten in der Kanne ankommt.
  // Ein fester Anteil bleibt im nassen Papierfilter hängen (unabhängig vom Material),
  // ein weiterer Anteil verdampft/verbleibt als Film an der heißen Wandung - dieser Anteil
  // ist bei Keramik höher, weil sie länger heiß bleibt und mehr Wärme (und damit Dampf) zieht.
  var PREHEAT_FILTER_ABSORPTION = 10; // g, ca. konstant für einen V60-01-Papierfilter
  var PREHEAT_EVAP_RATE = { plastik: 0.02, keramik: 0.04 }; // Anteil des aufgegossenen Wassers

  var preheatTargetInput = document.getElementById("input-preheat-target");
  var preheatTargetSlider = document.getElementById("slider-preheat-target");
  var preheatMaterialRadios = document.querySelectorAll('input[name="preheat-material"]');
  var preheatResultEl = document.getElementById("preheat-result");

  function fmt(n, decimals) {
    return n.toLocaleString("de-DE", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  }

  function fmtTime(totalSeconds) {
    var m = Math.floor(totalSeconds / 60);
    var s = Math.round(totalSeconds - m * 60);
    if (s === 60) { m += 1; s = 0; }
    return m + ":" + (s < 10 ? "0" + s : s);
  }

  function roundToStep(seconds, step) {
    return Math.max(step, Math.round(seconds / step) * step);
  }

  // Wasser bestimmt: Kaffeemehl-Feld über das feste Verhältnis nachziehen
  function fromWater() {
    var water = parseFloat(waterInput.value);
    if (!water || water <= 0) {
      resultEl.innerHTML = '<p class="calc-note warn">Bitte einen Wert größer 0 eingeben.</p>';
      ablaufBody.innerHTML = "";
      return;
    }
    var coffee = Math.round((water / RATIO) * 10) / 10;
    groundsInput.value = coffee;
    update(water, coffee);
  }

  // Kaffeemehl bestimmt: Wasser-Feld über das feste Verhältnis nachziehen
  function fromGrounds() {
    var coffee = parseFloat(groundsInput.value);
    if (!coffee || coffee <= 0) {
      resultEl.innerHTML = '<p class="calc-note warn">Bitte einen Wert größer 0 eingeben.</p>';
      ablaufBody.innerHTML = "";
      return;
    }
    var water = Math.round(coffee * RATIO);
    waterInput.value = water;
    update(water, coffee);
  }

  function update(water, coffee) {
    waterSlider.value = water;
    groundsSlider.value = coffee;
    renderResult(coffee, water);
    renderAblauf(water);
  }

  // Slider bestimmt: zugehöriges Zahlenfeld übernimmt den Wert, Rest wie gehabt nachziehen
  function fromWaterSlider() {
    waterInput.value = waterSlider.value;
    fromWater();
  }

  function fromGroundsSlider() {
    groundsInput.value = groundsSlider.value;
    fromGrounds();
  }

  function renderResult(coffee, water) {
    resultEl.innerHTML =
      '<div class="calc-stats">' +
        '<div><div class="calc-stat-num">' + fmt(coffee, 1) + '&nbsp;g</div><div class="calc-stat-label">Kaffeemehl</div></div>' +
        '<div class="calc-sep">:</div>' +
        '<div><div class="calc-stat-num">' + fmt(water, 0) + '&nbsp;g</div><div class="calc-stat-label">Wasser</div></div>' +
        '<div class="calc-sep">=</div>' +
        '<div><div class="calc-stat-num">1:16,7</div><div class="calc-stat-label">Verhältnis</div></div>' +
      '</div>';
  }

  function renderAblauf(water) {
    var k = water / BASE_WATER; // Skalierungsfaktor gegenüber dem Basisrezept (250 g)
    var amounts = STAGE_FRACTIONS.map(function (f) { return water * f; });
    var pourDurations = BASE_POUR_SECONDS.map(function (s) { return roundToStep(s * k, 5); });

    var rows = [];
    var t = 0;

    // Bloom
    var bloomDur = pourDurations[0];
    rows.push({ start: t, end: t + bloomDur, action: "Wasser für den Bloom aufgießen", amount: fmt(amounts[0], 0) + "&nbsp;g" });
    t += bloomDur;

    rows.push({ start: t, end: t + SWIRL_AFTER_BLOOM, action: "V60 sanft schwenken, bis kein trockener Kaffee mehr sichtbar ist", amount: "&ndash;" });
    t += SWIRL_AFTER_BLOOM;

    rows.push({ start: t, end: t + BLOOM_REST, action: "Warten", amount: "&ndash;" });
    t += BLOOM_REST;

    var stageLabels = ["Kreisend aufgießen", "Aufgießen", "Aufgießen", "Auf Zielmenge auffüllen"];
    var stagePercents = [40, 60, 80, 100];

    for (var i = 1; i <= 4; i++) {
      var dur = pourDurations[i];
      rows.push({
        start: t,
        end: t + dur,
        action: stageLabels[i - 1],
        amount: fmt(amounts[i], 0) + "&nbsp;g (" + stagePercents[i - 1] + "&nbsp;%)"
      });
      t += dur;

      if (i < 4) {
        rows.push({ start: t, end: t + POUR_PAUSE, action: "Pause", amount: "&ndash;" });
        t += POUR_PAUSE;
      }
    }

    rows.push({ start: t, end: t + FINAL_SWIRL, action: "Sanft schwenken, damit sich das Bett flach absetzt", amount: "&ndash;" });
    t += FINAL_SWIRL;

    var tail = roundToStep(DRAWDOWN_TAIL_BASE * k, 5);
    var doneAt = t + tail;
    rows.push({
      start: doneAt,
      end: null,
      action: "Drawdown (das vollständige Durchlaufen des Wassers durch das Kaffeebett) sollte abgeschlossen sein &ndash; Richtwert, nach Augenmaß prüfen",
      amount: "&ndash;"
    });

    ablaufBody.innerHTML = rows.map(function (r) {
      var zeit = r.end !== null ? (fmtTime(r.start) + "&ndash;" + fmtTime(r.end)) : ("ca. " + fmtTime(r.start));
      return (
        "<tr>" +
        '<td data-label="Zeit">' + zeit + "</td>" +
        '<td data-label="Aktion">' + r.action + "</td>" +
        '<td data-label="Gesamtmenge">' + r.amount + "</td>" +
        "</tr>"
      );
    }).join("");
  }

  waterInput.addEventListener("input", fromWater);
  groundsInput.addEventListener("input", fromGrounds);
  waterSlider.addEventListener("input", fromWaterSlider);
  groundsSlider.addEventListener("input", fromGroundsSlider);
  fromWater();

  function getPreheatMaterial() {
    var checked = document.querySelector('input[name="preheat-material"]:checked');
    return checked ? checked.value : "keramik";
  }

  function updatePreheat() {
    var target = parseFloat(preheatTargetInput.value);
    if (!target || target <= 0) {
      preheatResultEl.innerHTML = '<p class="calc-note warn">Bitte einen Wert größer 0 eingeben.</p>';
      return;
    }

    var material = getPreheatMaterial();
    var rate = PREHEAT_EVAP_RATE[material];
    var needed = roundToStep((target + PREHEAT_FILTER_ABSORPTION) / (1 - rate), 5);
    var loss = needed - target;
    var wall = material === "keramik" ? "Keramik" : "Kunststoffwand";

    preheatResultEl.innerHTML =
      '<div class="calc-stats">' +
        '<div><div class="calc-stat-num">' + fmt(needed, 0) + '&nbsp;g</div><div class="calc-stat-label">Vorwärmwasser aufgießen</div></div>' +
        '<div class="calc-sep">&rarr;</div>' +
        '<div><div class="calc-stat-num">' + fmt(target, 0) + '&nbsp;g</div><div class="calc-stat-label">kommt in der Kanne an</div></div>' +
      '</div>' +
      '<p class="calc-hint calc-hint-centered">Kalkuliert mit ca.&nbsp;' + fmt(loss, 0) + '&nbsp;g Verlust (Filterabsorption + Verdunstung an der ' + wall + ').</p>';
  }

  function fromPreheatInput() {
    preheatTargetSlider.value = preheatTargetInput.value;
    updatePreheat();
  }

  function fromPreheatSlider() {
    preheatTargetInput.value = preheatTargetSlider.value;
    updatePreheat();
  }

  preheatTargetInput.addEventListener("input", fromPreheatInput);
  preheatTargetSlider.addEventListener("input", fromPreheatSlider);
  for (var i = 0; i < preheatMaterialRadios.length; i++) {
    preheatMaterialRadios[i].addEventListener("change", updatePreheat);
  }
  updatePreheat();
})();
