package dev.slash3rss.slashclient.hud.players;

import net.minecraft.network.chat.Component;

/**
 * "● NA ŻYWO" above a live player's name: kept on the entity's render state (1.21.2+, mixin
 * EntityRenderStateMixin) while the state is filled, and drawn one line above the name by
 * LiveNametagMixin / LivePlayerNametagMixin. Before 1.21.2 the entity itself is at hand there.
 */
public interface LiveTag {
	/** One line of a name tag, in blocks: the vanilla 9 px × 1.15 at the name tag's scale (as the score below the name). */
	float LINE = 9 * 1.15f * 0.025f;

	Component slashclient$live();

	void slashclient$setLive(Component label);
}
