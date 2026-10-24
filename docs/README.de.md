# GM Schnellbefehle

Obsidian-Plugin für markierten Text, Charakterseiten und gemeinsame TODOs. Aktueller Stand: **1.2.1**. Die Formatierungsbefehle funktionieren eigenständig. Charakter- und TODO-Funktionen verwenden die API von [Classic Notebook](https://github.com/SetupCoding/obsidian-classic-notebook).

1. Text zum Bearbeiten öffnen und markieren. In Canvas dazu in eine Textkarte doppelklicken.
2. `Strg+P` drücken.
3. Einen dieser Befehle wählen:

| Befehl | Formatierung |
| --- | --- |
| GM Notiz | Blau und fett |
| Wichtig | Rot und fett |
| Wichtig 2!! | Rot, fett und 20 % größer |

Die drei Formatierungsbefehle gehören zum eigenständigen Plugin „GM Schnellbefehle“ und benötigen Classic Notebook nicht. `Strg+P` bleibt die normale Obsidian-Befehlspalette. Die Befehle sind verfügbar, wenn bearbeitbarer Text markiert ist. Ein weiterer Befehl ersetzt die zuvor gewählte Formatierung ohne verschachtelte Format-Tags. Änderungen können mit der nativen Rückgängig-Funktion zurückgenommen werden.

Mit „Char anlegen“ lässt sich aus markiertem Text eine Charakterseite erstellen. Der Dialog belegt den Namen vor und bietet ein Eingabefeld für die Unterkategorie. Vorhandene Gruppen werden über ihren Namen gesucht; eindeutige Teiltreffer werden aufgelöst und das Ziel vor dem Anlegen angezeigt. Bei mehreren Treffern muss eine Gruppe gewählt werden. Eine neue Unterkategorie wird ausdrücklich angekündigt und zusammen mit dem Char erstellt. Ohne Unterkategorie landet die Seite direkt im Abschnitt. Der Zielabschnitt ist standardmäßig `Chars` und kann im Dialog geändert werden. Abschnitt und zuletzt verwendete Unterkategorie werden pro Vault gemerkt.

Dieser zusätzliche Befehl benötigt Classic Notebook ab 2.9.0 für die Seitenhierarchie. Neue Char-Seiten sind native Canvas-Dateien und werden unter der gewählten Elternseite eingerückt. Eine Textkarte enthält Name, Kategorie, einen Verweis zur Ausgangsseite und Platz für Notizen. Der Name und die ursprüngliche Markierung werden als Aliase erfasst; bei aktivierten automatischen Verknüpfungen werden passende Erwähnungen dadurch klickbar. Auch Canvas-Seiten können Alias-Ziele sein. Der ursprüngliche Notiztext wird nicht verändert. Existiert die Seite bereits, bietet der Dialog das Öffnen an und überschreibt nichts.

Für optionale Integrationen stellt Classic Notebook `getNotebookPageParents(section)` und `createNotebookPage({section,title,parentPath,text,aliases,kind})` bereit. Die Schnittstelle verwaltet die Hierarchie und das Anlegedatum im laufenden Plugin. Fremde Plugins müssen dafür keine Einstellungsdateien direkt ändern.

Über `Strg+P` sind außerdem „TODO anlegen“, „Char TODO“ und „TODO-Übersicht öffnen“ verfügbar. Eine Textauswahl wird im Dialog als Aufgabe vorbelegt und zusätzlich als ursprüngliche Notiz mit Verweis zur Ausgangsseite übernommen. Das funktioniert in Textseiten, Canvas-Textkarten und den gerenderten Textkästen der Gesamtansicht. Ohne Auswahl lässt sich eine Aufgabe frei eingeben. Die Aufgabe und eine zusätzliche Spielnotiz können vor dem Speichern angepasst werden.

Bei „Char TODO“ muss der Charakter ausdrücklich aus einer Liste gewählt werden. Die Suche berücksichtigt Namen und Aliase. So kann ein Versprechen dem handelnden Charakter zugeordnet werden, auch wenn in der markierten Notiz nur der Empfänger genannt ist. Auf der Charseite erscheint ein eigener Bereich „Char TODOs“ beziehungsweise eine native Canvas-Dateikarte mit der Aufgabe.

Die Übersicht „TODOs“ liegt unter Allgemein und bleibt eine native Canvas-Seite. Jede Aufgabe ist genau einmal als native Checkbox mit einer Blockkennung in einer gemeinsamen Markdown-Aufgabenliste gespeichert. Übersicht und Charseiten zeigen denselben Eintrag über Obsidian-Einbettungen an. Das Erledigt-Häkchen hat deshalb überall denselben Stand. Bei einer vollständig auf Canvas umgestellten Oberfläche bleibt die interne Aufgabenliste aus der Seitenleiste ausgeblendet; das Öffnen führt zur Canvas-Übersicht. Bestehende Beschreibungen, Canvas-Karten, Textkastenpositionen und Entwürfe bleiben erhalten. Die markierte Ausgangsnotiz wird nicht verändert.

Die TODO-Befehle benötigen Classic Notebook ab 2.13.0 für die Integration in normale Textseiten, freie Seitenflächen und Canvas. Die drei Formatierungsbefehle bleiben unabhängig davon nutzbar. Auch der neue Integrationsaufruf `appendNotebookPageEmbed({file,embedFile,subpath,key,label,width,height})` ist allgemein gehalten und enthält keine festen Kampagnen- oder Charakternamen.

Die Darstellung wird als einfaches Inline-HTML in Markdown beziehungsweise im Text der Canvas-Karte gespeichert. Wiki-Linkziele und vorhandene Markdown-Hervorhebungen bleiben erhalten. Im Live Preview werden die Format-Tags ausgeblendet; im Quellmodus bleiben sie editierbar. Code und Eigenschaften werden nicht als normaler Text formatiert.

## Installation

Die drei Dateien `main.js`, `manifest.json` und `styles.css` aus dem Repository in `.obsidian/plugins/gm-note-shortcuts/` des gewünschten Vaults kopieren. Obsidian neu laden und das Plugin unter Einstellungen → Externe Erweiterungen aktivieren. Die erzeugten Dateien im Repository sind direkt installierbar.

Persönliche Einstellungen, Notizen und lokale Importprofile sind nicht enthalten. Alle Einstellungen werden pro Vault gespeichert.

## Entwicklung

Node.js ab Version 22:

```sh
npm run build
npm test
```

Build und Tests benötigen keine zusätzlich installierten npm-Pakete. Obsidian und CodeMirror werden zur Laufzeit von Obsidian bereitgestellt. `src/` enthält Plugin-Code, Styles und das ursprüngliche Manifest; `shared/` enthält die beim Build eingebundenen Module. `main.js`, `manifest.json` und `styles.css` im Wurzelverzeichnis sind die erzeugten Installationsdateien. Tests verwenden neutrale Beispieldaten.

## Status

Öffentliche Desktop-Beta unter MIT-Lizenz. Noch nicht im Obsidian-Community-Verzeichnis gelistet. Mindestversion und aktuelle Einschränkungen stehen in der englischen README und in docs/TESTING.md.

## Integrationstests mit Classic Notebook

Beide Repos nebeneinander auschecken und Classic Notebook zuerst bauen:

```sh
cd ../obsidian-classic-notebook
npm run build
cd ../obsidian-gm-shortcuts
npm run test:integration
```

Bei einer anderen Ordnerstruktur kann `CLASSIC_NOTEBOOK_DIR` auf den gebauten Classic-Notebook-Checkout zeigen. Die Integrationstests prüfen echte Charakter- und TODO-Abläufe mit beiden Plugins, ohne Notizdaten eines echten Vaults zu verwenden.

## Gemeinsames Textformat

`shared/inline-text-formats.js` und `shared/color-edit.js` sind in beiden Repos identisch. Damit bleibt jedes Plugin separat baubar. Die gemeinsame Quelle liegt im Classic-Notebook-Repository unter shared/. Änderungen dort vornehmen, die Kopien über dessen gemeinsamen Sync-Befehl aktualisieren und beide Plugins testen.
