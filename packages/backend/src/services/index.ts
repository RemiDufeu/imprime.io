import { ImageService } from './ImageService.js'
import { FontService } from './FontService.js'
import { VariableService } from './VariableService.js'
import { PageService } from './PageService.js'
import { TemplateService } from './TemplateService.js'
import { ExportService } from './ExportService.js'
import { PreviewService } from './PreviewService.js'
import { TemplateFileService } from './TemplateFileService.js'
import { OnboardingService } from './OnboardingService.js'
import { MailerService } from './MailerService.js'
import { AuthService } from './AuthService.js'
import { SettingsService } from './SettingsService.js'

// Instantiate services with dependency injection
const imageService = new ImageService()
const fontService = new FontService()
const variableService = new VariableService()
const pageService = new PageService(imageService)
const templateService = new TemplateService(imageService)
const exportService = new ExportService(imageService, fontService)
const previewService = new PreviewService(templateService, exportService)
const templateFileService = new TemplateFileService(templateService, pageService, variableService, imageService)
const onboardingService = new OnboardingService(templateFileService)
const mailerService = new MailerService()
const authService = new AuthService(mailerService, onboardingService)
const settingsService = new SettingsService(mailerService, authService)

export {
  imageService,
  fontService,
  variableService,
  pageService,
  templateService,
  exportService,
  previewService,
  templateFileService,
  onboardingService,
  mailerService,
  authService,
  settingsService,
}
export { AppError, NotFoundError, ForbiddenError, ValidationError, ConflictError } from './errors.js'
