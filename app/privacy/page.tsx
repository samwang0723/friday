import { useTranslations } from "next-intl";

export default function PrivacyPolicy() {
  const t = useTranslations("privacy");

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">{t("title")}</h1>
          <p className="text-gray-400">{t("lastUpdated")}</p>
        </div>

        <div className="space-y-8">
          <section>
            <h2 className="text-2xl font-semibold mb-4">{t("overview.title")}</h2>
            <p className="text-gray-300 leading-relaxed">{t("overview.content")}</p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">{t("dataCollection.title")}</h2>
            <div className="space-y-4">
              <p className="text-gray-300 leading-relaxed">{t("dataCollection.intro")}</p>
              <ul className="list-disc list-inside text-gray-300 space-y-2 ml-4">
                <li>{t("dataCollection.voiceData")}</li>
                <li>{t("dataCollection.conversationHistory")}</li>
                <li>{t("dataCollection.technicalData")}</li>
                <li>{t("dataCollection.authData")}</li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">{t("dataUsage.title")}</h2>
            <div className="space-y-4">
              <p className="text-gray-300 leading-relaxed">{t("dataUsage.intro")}</p>
              <ul className="list-disc list-inside text-gray-300 space-y-2 ml-4">
                <li>{t("dataUsage.providingServices")}</li>
                <li>{t("dataUsage.improvingAccuracy")}</li>
                <li>{t("dataUsage.personalizing")}</li>
                <li>{t("dataUsage.troubleshooting")}</li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">{t("dataSharing.title")}</h2>
            <div className="space-y-4">
              <p className="text-gray-300 leading-relaxed">{t("dataSharing.intro")}</p>
              <ul className="list-disc list-inside text-gray-300 space-y-2 ml-4">
                <li>{t("dataSharing.aiProviders")}</li>
                <li>{t("dataSharing.serviceProviders")}</li>
                <li>{t("dataSharing.legalRequirements")}</li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">{t("dataRetention.title")}</h2>
            <p className="text-gray-300 leading-relaxed">{t("dataRetention.content")}</p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">{t("userRights.title")}</h2>
            <div className="space-y-4">
              <p className="text-gray-300 leading-relaxed">{t("userRights.intro")}</p>
              <ul className="list-disc list-inside text-gray-300 space-y-2 ml-4">
                <li>{t("userRights.access")}</li>
                <li>{t("userRights.correction")}</li>
                <li>{t("userRights.deletion")}</li>
                <li>{t("userRights.dataPortability")}</li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">{t("security.title")}</h2>
            <p className="text-gray-300 leading-relaxed">{t("security.content")}</p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">{t("contact.title")}</h2>
            <p className="text-gray-300 leading-relaxed">{t("contact.content")}</p>
          </section>

          <section className="border-t border-gray-700 pt-8">
            <p className="text-gray-400 text-sm text-center">
              © 2024 Friday Inc. All rights reserved.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}