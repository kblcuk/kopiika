const { withXcodeProject } = require('@expo/config-plugins');
const {
	findNativeTargetByName,
	findFirstNativeTarget,
} = require('@expo/config-plugins/build/ios/Target');
const {
	getBuildConfigurationsForListId,
	getProjectSection,
	isNotComment,
} = require('@expo/config-plugins/build/ios/utils/Xcodeproj');

function setBuildSettings(buildSettings, { profileName, appleTeamId }) {
	buildSettings.CODE_SIGN_STYLE = 'Manual';
	buildSettings.DEVELOPMENT_TEAM = appleTeamId;
	buildSettings.PROVISIONING_PROFILE_SPECIFIER = `"${profileName}"`;
}

function withMatchSigning(config, props) {
	return withXcodeProject(config, (config) => {
		const project = config.modResults;
		const nativeTargetEntry = props.targetName
			? findNativeTargetByName(project, props.targetName)
			: findFirstNativeTarget(project);
		const [nativeTargetId, nativeTarget] = nativeTargetEntry;

		for (const [, buildConfig] of getBuildConfigurationsForListId(
			project,
			nativeTarget.buildConfigurationList,
		)) {
			if (buildConfig.name === 'Debug') {
				setBuildSettings(buildConfig.buildSettings, {
					profileName: props.developmentProfileName,
					appleTeamId: props.appleTeamId,
				});
			}

			if (buildConfig.name === 'Release') {
				setBuildSettings(buildConfig.buildSettings, {
					profileName: props.distributionProfileName,
					appleTeamId: props.appleTeamId,
				});
			}
		}

		for (const [, item] of Object.entries(getProjectSection(project)).filter(isNotComment)) {
			if (!item.attributes.TargetAttributes[nativeTargetId]) {
				item.attributes.TargetAttributes[nativeTargetId] = {};
			}

			item.attributes.TargetAttributes[nativeTargetId].ProvisioningStyle = 'Manual';
			item.attributes.TargetAttributes[nativeTargetId].DevelopmentTeam = `"${props.appleTeamId}"`;
		}

		return config;
	});
}

module.exports = withMatchSigning;
