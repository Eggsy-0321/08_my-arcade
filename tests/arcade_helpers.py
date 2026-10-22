"""Navigate the portal through its public carousel controls."""
def launch_game(page, title):
    page.locator('#game-list[aria-busy="false"] .is-selected').wait_for()
    for _ in range(page.locator('#game-list .cabinet').count()):
        if page.locator('#selected-title').inner_text() == title:
            page.locator('#play-game').click()
            return
        page.locator('#next-game').click()
        page.wait_for_timeout(270)
    raise AssertionError(f'Game not found: {title}')
