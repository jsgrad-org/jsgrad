export type NB = {
  /**
  * Rended any html under the cell.
  */
  display: (html: string) => void
  /**
   * Display an image under the cell.
   */
  image: (href: string) => void
}

declare global {
  var nb: NB;
}
