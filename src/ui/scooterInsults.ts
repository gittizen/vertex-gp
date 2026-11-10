import { getLocale } from '../i18n/i18n'

/** 30 stupňujících narážek — past koloběžky. */
const CS: string[] = [
  'Buzna',
  'Ha, dvojtá buzna',
  'Trojitá buzna. Fakt?',
  'Čtyřnásobná buzna. Koloběžka není peklostroj.',
  'Pětidílná buzna. Ještě pořád tu stojíš?',
  'Šestinásobná buzna. KlecMania se směje.',
  'Sedminásobná buzna. Vem si skate.',
  'Osminásobná buzna. Asfalt tě odmítá.',
  'Devítinásobná buzna. Tohle už bolí i mě.',
  'Desetinásobná buzna. Legenda o blbci na koloběžce.',
  'Buzna level 11. Opravdu to zkoušíš dál?',
  'Buzna level 12. Rodiče by se styděli.',
  'Buzna level 13. I koloběžka chce pryč.',
  'Buzna level 14. Freestyle bez freestylu.',
  'Buzna level 15. Poloviční cesta k skatu.',
  'Buzna level 16. Věkové omezení tě varovalo.',
  'Buzna level 17. KlecMania blacklist: ty.',
  'Buzna level 18. Ještě dvanáct a dostaneš skate násilím.',
  'Buzna level 19. Historický moment: největší buzna Klecánek.',
  'Buzna level 20. Dvacet. Gratuluju. Stále blbost.',
  'Buzna level 21. Motor ti nepomůže. Nemáš žádný.',
  'Buzna level 22. Spojka? Nemáš. Mozek? Sporné.',
  'Buzna level 23. Trať se stydí, že na ni koukáš.',
  'Buzna level 24. Skate už na tebe mává z dálky.',
  'Buzna level 25. Pět do automatického skatu.',
  'Buzna level 26. Čtyři. Ještě stihneš zvolit sám.',
  'Buzna level 27. Tři. Poslední šance na důstojnost.',
  'Buzna level 28. Dva. Koloběžka pláče. Ty taky bys měl.',
  'Buzna level 29. Jedna. Příště už je skate povinný.',
  'Buzna level 30. Dost. Dostáváš skate. Buznoběžko končí.',
]

const EN: string[] = [
  'Buzna',
  'Ha, double buzna',
  'Triple buzna. Really?',
  'Quadruple buzna. A scooter is not a Hellrig.',
  'Five-stack buzna. Still standing here?',
  'Six-stack buzna. KlecMania is laughing.',
  'Seven-stack buzna. Take the skate.',
  'Eight-stack buzna. The asphalt rejects you.',
  'Nine-stack buzna. This hurts me too.',
  'Ten-stack buzna. Legend of the scooter fool.',
  'Buzna level 11. You’re still trying?',
  'Buzna level 12. Your parents would be ashamed.',
  'Buzna level 13. Even the scooter wants out.',
  'Buzna level 14. Freestyle without freestyle.',
  'Buzna level 15. Halfway to the skate.',
  'Buzna level 16. The age rating warned you.',
  'Buzna level 17. KlecMania blacklist: you.',
  'Buzna level 18. Twelve more and you get skate by force.',
  'Buzna level 19. Historic: biggest buzna in Klecany.',
  'Buzna level 20. Twenty. Congrats. Still nonsense.',
  'Buzna level 21. An engine won’t help. You don’t have one.',
  'Buzna level 22. Clutch? None. Brain? Debatable.',
  'Buzna level 23. The track is embarrassed you’re looking at it.',
  'Buzna level 24. The skate is waving from afar.',
  'Buzna level 25. Five until forced skate.',
  'Buzna level 26. Four. You can still pick it yourself.',
  'Buzna level 27. Three. Last shot at dignity.',
  'Buzna level 28. Two. The scooter is crying. You should too.',
  'Buzna level 29. One. Next time skate is mandatory.',
  'Buzna level 30. Enough. You get the skate. Buznoběžko ends.',
]

export const SCOOTER_INSULT_MAX = 30

export function scooterInsult(attempt: number): string {
  const list = getLocale() === 'en' ? EN : CS
  const i = Math.max(0, Math.min(SCOOTER_INSULT_MAX, attempt) - 1)
  return list[i] ?? list[list.length - 1]!
}
