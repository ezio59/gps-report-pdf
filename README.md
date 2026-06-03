# GPS Report PDF

Web app statica installabile su iPhone come PWA per trasformare screenshot di un localizzatore GPS veicolare in un prospetto PDF modificabile.

## Funzioni

- caricamento multiplo e riordino degli screenshot;
- riconoscimento OCR eseguito nel browser;
- tabella modificabile prima dell'esportazione;
- ricostruzione della partenza dalla sosta precedente al primo movimento;
- ricostruzione dell'arrivo dalla sosta raggiunta al termine dell'ultimo movimento;
- PDF con riepilogo, dettaglio cronologico e collegamenti cliccabili a Google Maps;
- pulsante **Carica esempio** per verificare il formato senza utilizzare immagini reali.

## Privacy

Gli screenshot vengono elaborati nel browser e non vengono salvati nel repository. Le librerie OCR e PDF sono caricate da CDN esterne quando l'app viene aperta.

## Pubblicazione con GitHub Pages

1. Aprire **Settings** del repository.
2. Selezionare **Pages**.
3. In **Build and deployment**, scegliere **Deploy from a branch**.
4. Selezionare il branch **main** e la cartella **/(root)**.
5. Premere **Save**.

L'indirizzo previsto è:

`https://ezio59.github.io/gps-report-pdf/`

## Installazione su iPhone

Aprire il link con Safari, toccare **Condividi** e scegliere **Aggiungi alla schermata Home**.

## Nota

Il riconoscimento automatico deve essere sempre verificato prima della generazione del PDF, perché qualità e taglio degli screenshot possono variare.
