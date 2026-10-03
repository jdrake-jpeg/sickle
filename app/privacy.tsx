import { LegalPage } from '@/components/LegalPage';
import legal from '@/constants/legal.json';

// Sickle's privacy policy. The text lives in constants/legal.json, which also
// builds the public page at sicklepickle.app/privacy (npm run build:site).
export default function PrivacyScreen() {
  return <LegalPage {...legal.privacy} />;
}
