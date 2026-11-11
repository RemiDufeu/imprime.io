// A template file, as "Export as a file" on a template's card writes one:
// replace it with a new export to change what new accounts start with.
import tutorialFile from '../assets/tutorial.imprime.json'
import type { TemplateFileService } from './TemplateFileService.js'

/**
 * What a new account finds in its space: its own copy of the tutorial, the
 * template file `assets/tutorial.imprime.json` imported for it.
 */
export class OnboardingService {
  constructor(private templateFileService: TemplateFileService) { }

  /**
   * Says at startup when the tutorial no longer imports: the template file
   * format changed since it was exported, and new accounts start empty until
   * it is exported again. Run once.
   */
  public checkTutorial(): void {
    try {
      this.templateFileService.parseFile(tutorialFile)
    } catch (error) {
      console.error('assets/tutorial.imprime.json does not import, new accounts start empty: export it again.', error)
    }
  }

  /**
   * Gives `userId`, an account just created, a copy of the tutorial. Never
   * throws: the account exists already, and a failed import only leaves it
   * empty.
   */
  public async welcome(userId: string): Promise<void> {
    try {
      await this.templateFileService.importFile(tutorialFile, userId)
    } catch (error) {
      console.error(`Failed to import the tutorial for the new account ${userId}:`, error)
    }
  }
}
