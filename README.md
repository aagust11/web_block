# contrOwl

contrOwl és una aplicació web senzilla per controlar l'accés a recursos externs mitjançant codis d'autorització i monitoratge de la pestanya activa.

## Funcionament

1. Introdueix un codi vàlid a la pantalla inicial.
2. Si el codi existeix a `codes.json`, es carrega l'enllaç associat dins d'un iframe.
3. El sistema monitoritza el canvi de pestanya o de finestra a partir de 10 segons després que el contingut estigui carregat. Si es detecta que la pestanya deixa d'estar en primer pla, l'accés es bloqueja.
4. Quan la sessió queda bloquejada, es mostra un diàleg que permet tornar a la pantalla d'accés o introduir una clau de desbloqueig.

## Configuració de `codes.json`

El fitxer `codes.json` conté un diccionari on cada clau és un codi normalitzat en MAJÚSCULES (4 a 10 caràcters). El valor és un objecte amb dues propietats:

- `link`: URL absoluta que es carregarà dins del visor.
- `unlock`: controla com es pot desbloquejar la sessió si es produeix un bloqueig.

### Valors possibles de `unlock`

| Valor        | Significat                                                                 |
|--------------|-----------------------------------------------------------------------------|
| `false`      | El recurs no disposa de desbloqueig ràpid. Cal tornar a la pantalla inicial |
| `true`       | El mateix codi d'accés serveix per desbloquejar la sessió bloquejada        |
| Cadena (string) | Clau específica que s'haurà d'introduir al diàleg de bloqueig             |

Exemple de fitxer:

```json
{
  "ABCD1234": { "link": "https://docs.google.com/forms/d/e/XXXXXXXX/viewform", "unlock": "Anajd/njs92!!1" },
  "EXAM2025": { "link": "https://example.com/activitat", "unlock": "ANDHSUID7%3395" },
  "LAB2024": { "link": "https://example.edu/laboratori", "unlock": true },
  "QUIZ0001": { "link": "https://example.net/quiz", "unlock": false }
}
```

## Personalització de textos

Els missatges i etiquetes de la interfície s'especifiquen a `missatges.json`. S'hi han afegit textos específics per descriure el comportament del camp `unlock` i les instruccions del formulari de desbloqueig.

## Verificació manual

Per assegurar que la clau mestra restaura l'accés en tots els escenaris de bloqueig:

1. **Bloqueig per monitoratge**
   - Obre un recurs amb un codi vàlid que activi el visor.
   - Quan el contingut estigui carregat, canvia de pestanya o minimitza la finestra per activar el bloqueig.
   - Quan aparegui el diàleg de bloqueig, introdueix la clau definida al fitxer `master_k` i comprova que el visor es reactiva immediatament.

2. **Bloqueig per intents exhaurits**
   - A la pantalla d'accés introdueix codis incorrectes fins que s'esgotin els intents disponibles.
   - Verifica que el formulari de desbloqueig es mostri i accepti l'entrada.
   - Introdueix la clau del fitxer `master_k` i comprova que el bloqueig desapareix i es restableixen els intents.
