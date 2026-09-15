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

  var preheatTargetDisplay = document.getElementById("preheat-target-display");
  var preheatMaterialRadios = document.querySelectorAll('input[name="preheat-material"]');
  var preheatResultEl = document.getElementById("preheat-result");
  var currentWater = BASE_WATER;
  var currentCoffee = BASE_COFFEE;

  // Empfohlene Brühtemperatur und Mahlgrad je Röstgrad: hellere, dichtere
  // Röstungen brauchen mehr Hitze und eher feineren Mahlgrad zur Extraktion.
  // Mit zunehmender Röstung wird die Bohne poröser und ölig-brüchig, extrahiert
  // dadurch schneller und braucht kühleres Wasser, gröberen Mahlgrad und eine
  // kürzere Brühzeit, sonst kippt der Kaffee Richtung bitter/aschig.
  var ROASTS = {
    zimt: {
      label: "Zimtröstung (Cinnamon)",
      temp: "98&ndash;100&nbsp;&deg;C",
      grind: "Fein bis mittel &ndash; sehr dichte Bohne, kaum Röstaromen"
    },
    hell: {
      label: "Hell (Light City)",
      temp: "96&ndash;98&nbsp;&deg;C",
      grind: "Mittel bis leicht fein"
    },
    mittel: {
      label: "Mittel (City)",
      temp: "92&ndash;94&nbsp;&deg;C",
      grind: "Mittel &ndash; Referenzmahlgrad des Rezepts"
    },
    mitteldunkel: {
      label: "Mittel-Dunkel (Full City)",
      temp: "90&ndash;92&nbsp;&deg;C",
      grind: "Mittel bis leicht gröber, leichter Ölglanz"
    },
    dunkel: {
      label: "Dunkel (Vienna/French)",
      temp: "86&ndash;89&nbsp;&deg;C",
      grind: "Gröber &ndash; poröse Struktur extrahiert schneller"
    },
    sehrdunkel: {
      label: "Sehr dunkel & ölig (Italian/Espresso)",
      temp: "80&ndash;85&nbsp;&deg;C",
      grind: "Deutlich gröber und kürzere Brühzeit, sonst schnell bitter/aschig"
    }
  };
  var roastSelect = document.getElementById("roast-level");
  var roastGrindHint = document.getElementById("roast-grind-hint");

  // Herstellerangabe (gerundet), wie viel Wasser gleichzeitig im Kegel stehen
  // darf, bevor er überläuft - abgeleitet aus der üblichen "Tassen"-Einteilung.
  var DRIPPER_CAPACITY = { "01": 300, "02": 600, "03": 900 };
  var sizeRadios = document.querySelectorAll('input[name="dripper-size"]');
  var capacityNoteEl = document.getElementById("capacity-note");
  var ablaufBatchNote = document.getElementById("ablauf-batch-note");

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
      capacityNoteEl.innerHTML = "";
      ablaufBatchNote.hidden = true;
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
      capacityNoteEl.innerHTML = "";
      ablaufBatchNote.hidden = true;
      return;
    }
    var water = Math.round(coffee * RATIO);
    waterInput.value = water;
    update(water, coffee);
  }

  function update(water, coffee) {
    waterSlider.value = water;
    groundsSlider.value = coffee;
    currentWater = water;
    currentCoffee = coffee;
    renderResult(coffee, water);
    renderBrew(water, coffee);
    updatePreheat(water);
  }

  function getRoastLevel() {
    return roastSelect && roastSelect.value ? roastSelect.value : "mittel";
  }

  function getDripperSize() {
    var checked = document.querySelector('input[name="dripper-size"]:checked');
    return checked ? checked.value : "01";
  }

  // Prüft, ob die Wassermenge die Kapazität des gewählten Brühgeräts übersteigt.
  // Ist das der Fall, würde der letzte Guss den Kegel randvoll laufen lassen -
  // die Lösung ist dann nicht "anders rechnen", sondern in mehreren kleineren
  // Durchgängen zu brühen (oder ein größeres Gerät zu nutzen).
  function renderBrew(water, coffee) {
    var size = getDripperSize();
    var capacity = DRIPPER_CAPACITY[size];
    var portions = water > capacity ? Math.ceil(water / capacity) : 1;

    if (portions > 1) {
      var brewWater = roundToStep(water / portions, 5);
      var brewCoffee = Math.round((coffee / portions) * 10) / 10;

      capacityNoteEl.innerHTML =
        '<p class="calc-note warn">' +
          fmt(water, 0) + '&nbsp;g Wasser übersteigen die Kapazität eines V60-' + size + ' (&asymp;' + fmt(capacity, 0) + '&nbsp;g) &ndash; beim letzten Guss würde das Wasser bis zum Rand stehen und überlaufen. ' +
          'Brüh stattdessen <strong>' + portions + '&nbsp;Durchgänge à ' + fmt(brewWater, 0) + '&nbsp;g Wasser / ' + fmt(brewCoffee, 1) + '&nbsp;g Kaffee</strong> nacheinander, oder wähle ein größeres Brühgerät.' +
        '</p>';

      ablaufBatchNote.innerHTML = 'Zeigt einen von ' + portions + '&nbsp;Durchgängen à ' + fmt(brewWater, 0) + '&nbsp;g Wasser &ndash; für die restliche Menge wiederholen.';
      ablaufBatchNote.hidden = false;
      renderAblauf(brewWater);
    } else {
      capacityNoteEl.innerHTML = "";
      ablaufBatchNote.hidden = true;
      renderAblauf(water);
    }
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
    var roast = ROASTS[getRoastLevel()];
    resultEl.innerHTML =
      '<div class="calc-stats">' +
        '<div><div class="calc-stat-num">' + fmt(coffee, 1) + '&nbsp;g</div><div class="calc-stat-label">Kaffeemehl</div></div>' +
        '<div class="calc-sep">:</div>' +
        '<div><div class="calc-stat-num">' + fmt(water, 0) + '&nbsp;g</div><div class="calc-stat-label">Wasser</div></div>' +
        '<div class="calc-sep">=</div>' +
        '<div><div class="calc-stat-num">1:16,7</div><div class="calc-stat-label">Verhältnis</div></div>' +
        '<div class="calc-sep">&middot;</div>' +
        '<div><div class="calc-stat-num">' + roast.temp + '</div><div class="calc-stat-label">Brühtemperatur</div></div>' +
      '</div>';
    roastGrindHint.innerHTML = "Mahlgrad: " + roast.grind;
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

  function updatePreheat(target) {
    preheatTargetDisplay.textContent = fmt(target, 0);

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

  for (var i = 0; i < preheatMaterialRadios.length; i++) {
    preheatMaterialRadios[i].addEventListener("change", function () {
      updatePreheat(currentWater);
    });
  }

  roastSelect.addEventListener("change", function () {
    renderResult(currentCoffee, currentWater);
  });

  for (var k = 0; k < sizeRadios.length; k++) {
    sizeRadios[k].addEventListener("change", function () {
      renderBrew(currentWater, currentCoffee);
    });
  }

  // Bohnen-Notizen: Bohne, Röstgrad und Mühlen-Mahlgrad im Browser speichern
  // (localStorage), um einen Kaffee später reproduzieren zu können.
  var BEAN_STORAGE_KEY = "v60-bean-notes";

  var beanNameInput = document.getElementById("bean-name");
  var beanRoastSelect = document.getElementById("bean-roast");
  var beanGrindInput = document.getElementById("bean-grind");
  var beanNoteInput = document.getElementById("bean-note");
  var beanSaveBtn = document.getElementById("bean-save");
  var beanListEl = document.getElementById("bean-list");
  var beanEmptyHint = document.getElementById("bean-empty-hint");

  function loadBeans() {
    try {
      var raw = window.localStorage.getItem(BEAN_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function saveBeans(beans) {
    try {
      window.localStorage.setItem(BEAN_STORAGE_KEY, JSON.stringify(beans));
    } catch (e) {
      // localStorage nicht verfügbar (z. B. privates Fenster) - Einträge gelten nur für diese Sitzung
    }
  }

  function renderBeans() {
    var beans = loadBeans();
    beanEmptyHint.hidden = beans.length > 0;

    beanListEl.innerHTML = beans.map(function (bean) {
      var roast = ROASTS[bean.roast] || ROASTS.mittel;
      var note = bean.note ? '<div class="bean-item-note">' + escapeHtml(bean.note) + "</div>" : "";
      return (
        '<li class="bean-item" data-id="' + bean.id + '">' +
          '<div class="bean-item-main">' +
            '<div class="bean-item-name">' + escapeHtml(bean.name) + "</div>" +
            '<div class="bean-item-meta">' + roast.label + " &middot; Mahlgrad: " + escapeHtml(bean.grind) + "</div>" +
            note +
          "</div>" +
          '<div class="bean-item-actions">' +
            '<button type="button" class="btn-secondary" data-action="apply">Anwenden</button>' +
            '<button type="button" class="btn-secondary btn-danger" data-action="delete">Löschen</button>' +
          "</div>" +
        "</li>"
      );
    }).join("");
  }

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function makeBeanId() {
    return "bean-" + Date.now() + "-" + Math.round(Math.random() * 1e6);
  }

  beanSaveBtn.addEventListener("click", function () {
    var name = beanNameInput.value.trim();
    var grind = beanGrindInput.value.trim();
    if (!name || !grind) {
      return;
    }

    var beans = loadBeans();
    beans.unshift({
      id: makeBeanId(),
      name: name,
      roast: beanRoastSelect.value,
      grind: grind,
      note: beanNoteInput.value.trim()
    });
    saveBeans(beans);
    renderBeans();

    beanNameInput.value = "";
    beanGrindInput.value = "";
    beanNoteInput.value = "";
    beanNameInput.focus();
  });

  beanListEl.addEventListener("click", function (event) {
    var button = event.target.closest("button[data-action]");
    if (!button) {
      return;
    }
    var item = button.closest(".bean-item");
    var id = item.getAttribute("data-id");
    var beans = loadBeans();

    if (button.getAttribute("data-action") === "delete") {
      saveBeans(beans.filter(function (bean) { return bean.id !== id; }));
      renderBeans();
      return;
    }

    if (button.getAttribute("data-action") === "apply") {
      var bean = beans.filter(function (b) { return b.id === id; })[0];
      if (!bean) {
        return;
      }
      roastSelect.value = bean.roast;
      renderResult(currentCoffee, currentWater);
      document.getElementById("rechner").scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });

  renderBeans();
})();
