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

  var targetInput = document.getElementById("input-target");
  var groundsInput = document.getElementById("input-grounds");
  var resultEl = document.getElementById("calc-result");
  var ablaufBody = document.getElementById("ablauf-body");

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

  function calculate() {
    var target = parseFloat(targetInput.value);
    var grounds = parseFloat(groundsInput.value);

    if (!target || !grounds || target <= 0 || grounds <= 0) {
      resultEl.innerHTML = '<p class="calc-note warn">Bitte für beide Felder einen Wert größer 0 eingeben.</p>';
      ablaufBody.innerHTML = "";
      return;
    }

    // Beide Parameter führen unabhängig voneinander zu einer möglichen Rezeptgröße
    // über das feste Verhältnis 1:16,7 - es gilt die kleinere (limitierende) Menge.
    var coffeeFromTarget = target / RATIO;
    var coffeeFromGrounds = grounds;

    var coffee, water, limitedByGrounds;
    if (coffeeFromTarget <= coffeeFromGrounds) {
      coffee = coffeeFromTarget;
      water = target;
      limitedByGrounds = false;
    } else {
      coffee = coffeeFromGrounds;
      water = coffeeFromGrounds * RATIO;
      limitedByGrounds = true;
    }

    renderResult(coffee, water, limitedByGrounds, target, grounds);
    renderAblauf(water);
  }

  function renderResult(coffee, water, limitedByGrounds, target, grounds) {
    var note;
    if (limitedByGrounds) {
      note =
        '<p class="calc-note warn">Dein Kaffeemehl reicht nicht für ' + fmt(target, 0) +
        ' g fertigen Kaffee. Mit ' + fmt(grounds, 1) + ' g Kaffeemehl werden daraus rund <strong>' +
        fmt(water, 0) + ' g</strong> fertiger Kaffee.</p>';
    } else {
      var rest = grounds - coffee;
      if (rest > 0.05) {
        note =
          '<p class="calc-note ok">Dein Kaffeemehl reicht. Für ' + fmt(target, 0) +
          ' g fertigen Kaffee brauchst du ' + fmt(coffee, 1) + ' g davon, ' +
          fmt(rest, 1) + ' g bleiben übrig.</p>';
      } else {
        note = '<p class="calc-note ok">Dein Kaffeemehl reicht genau für dein Ziel.</p>';
      }
    }

    resultEl.innerHTML =
      '<div class="calc-stats">' +
        '<div><div class="calc-stat-num">' + fmt(coffee, 1) + '&nbsp;g</div><div class="calc-stat-label">Kaffeemehl</div></div>' +
        '<div class="calc-sep">:</div>' +
        '<div><div class="calc-stat-num">' + fmt(water, 0) + '&nbsp;g</div><div class="calc-stat-label">Wasser</div></div>' +
        '<div class="calc-sep">=</div>' +
        '<div><div class="calc-stat-num">1:16,7</div><div class="calc-stat-label">Verhältnis</div></div>' +
      '</div>' +
      note;
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

  targetInput.addEventListener("input", calculate);
  groundsInput.addEventListener("input", calculate);
  calculate();
})();
