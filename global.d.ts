export type NB = {
  /**
  * Rended any html under the cell.
  */
  display: (html: string) => void
  /**
   * Display an image under the cell.
   */
  image: (src: string) => void
  /**
   * Run JS code on main thread
   */
  eval: (code:string) => void
}

declare global {
  var nb: NB;
}
