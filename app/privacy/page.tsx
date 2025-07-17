import { useTranslations } from "next-intl";
import Link from "next/link";

export default function PrivacyPolicy() {
  const t = useTranslations("privacy");

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white rounded-2xl">
      {/* Back Button */}
      <div className="fixed top-4 left-4 z-50">
        <Link
          href="/"
          className="flex items-center justify-center p-3 rounded-full bg-neutral-200/80 dark:bg-neutral-800/80 backdrop-blur-md hover:bg-neutral-300/80 dark:hover:bg-neutral-700/80 transition-colors shadow-lg"
          aria-label="Back to home"
        >
          <svg
            className="h-6 w-6 text-neutral-700 dark:text-neutral-300"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.5"
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </Link>
      </div>

      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">{t("title")}</h1>
          <p className="text-gray-400 text-sm">{t("lastUpdated")}</p>
        </div>

        <div className="space-y-8">
          <section>
            <h2 className="text-xl font-semibold mb-3">
              {t("overview.title")}
            </h2>
            <p className="text-gray-300 leading-relaxed text-sm">
              {t("overview.content")}
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">
              {t("dataCollection.title")}
            </h2>
            <div className="space-y-3">
              <p className="text-gray-300 leading-relaxed text-sm">
                {t("dataCollection.intro")}
              </p>
              <ul className="list-disc list-inside text-gray-300 space-y-1 ml-4 text-sm">
                <li>{t("dataCollection.voiceData")}</li>
                <li>{t("dataCollection.conversationHistory")}</li>
                <li>{t("dataCollection.technicalData")}</li>
                <li>{t("dataCollection.authData")}</li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">
              {t("dataUsage.title")}
            </h2>
            <div className="space-y-3">
              <p className="text-gray-300 leading-relaxed text-sm">
                {t("dataUsage.intro")}
              </p>
              <ul className="list-disc list-inside text-gray-300 space-y-1 ml-4 text-sm">
                <li>{t("dataUsage.providingServices")}</li>
                <li>{t("dataUsage.improvingAccuracy")}</li>
                <li>{t("dataUsage.personalizing")}</li>
                <li>{t("dataUsage.troubleshooting")}</li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">
              {t("dataSharing.title")}
            </h2>
            <div className="space-y-3">
              <p className="text-gray-300 leading-relaxed text-sm">
                {t("dataSharing.intro")}
              </p>
              <ul className="list-disc list-inside text-gray-300 space-y-1 ml-4 text-sm">
                <li>{t("dataSharing.aiProviders")}</li>
                <li>{t("dataSharing.serviceProviders")}</li>
                <li>{t("dataSharing.legalRequirements")}</li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">
              {t("dataRetention.title")}
            </h2>
            <p className="text-gray-300 leading-relaxed text-sm">
              {t("dataRetention.content")}
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">
              {t("userRights.title")}
            </h2>
            <div className="space-y-3">
              <p className="text-gray-300 leading-relaxed text-sm">
                {t("userRights.intro")}
              </p>
              <ul className="list-disc list-inside text-gray-300 space-y-1 ml-4 text-sm">
                <li>{t("userRights.access")}</li>
                <li>{t("userRights.correction")}</li>
                <li>{t("userRights.deletion")}</li>
                <li>{t("userRights.dataPortability")}</li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">
              {t("security.title")}
            </h2>
            <p className="text-gray-300 leading-relaxed text-sm">
              {t("security.content")}
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">{t("contact.title")}</h2>
            <p className="text-gray-300 leading-relaxed text-sm">
              {t("contact.content")}
            </p>
          </section>

          {/* Company Disclaimer */}
          <section>
            <p className="text-xs text-gray-500 text-center">
              © 2025 Friday Intelligence Inc. All rights reserved.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
